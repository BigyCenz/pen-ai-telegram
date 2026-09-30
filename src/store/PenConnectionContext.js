// Stato condiviso di connessione, tenuto DELIBERATAMENTE separato in due
// livelli indipendenti, perché sono due cose diverse che possono fallire in
// modi diversi:
//
//   1) WIFI: il telefono è associato alla rete della penna? (livello
//      sistema operativo, non richiede nessun comando verso la penna)
//   2) PEN SESSION: sopra quella rete, è stata aperta la sessione TCP verso
//      la penna (ping/pong, login, live view)? (livello applicativo)
//
// Prima le due cose erano mischiate in un unico handler in HomeScreen. Ora
// questo Context espone entrambi gli stati e le azioni per gestirli, così
// le schermate possono reagire a "sei sulla rete giusta?" indipendentemente
// da "la penna ha accettato la sessione?".
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  ensurePermissions,
  getCurrentSSID,
  isPenNetwork,
  connectToPen,
  disconnectFromPen,
  scanPenNetworks,
  DEFAULT_PEN_IP,
  DEFAULT_SSID_PREFIX,
} from '../services/wifiManager';
import { NaxclowClient, discoverDevice, extractDevIdFromSsid } from '../services/naxclowClient';
import { startRemoteListener, stopRemoteListener } from '../services/bluetoothRemoteListener';
import { captureSnapshot, sendImageThroughPipeline, runCaptureToTelegramFlow } from '../services/automationPipeline';
import { validateSettings } from '../services/settingsValidation';
import { useSettings } from './SettingsContext';

const PenConnectionContext = createContext(null);

// Stati possibili della rete WiFi rispetto alla penna.
export const WIFI_STATUS = {
  UNKNOWN: 'unknown', // non ancora controllato
  NOT_PEN: 'not_pen', // connesso a un'altra rete (o a nessuna)
  PEN_NETWORK: 'pen_network', // connesso a una rete che sembra della penna
};

// Stati della sessione applicativa verso la penna (sopra il WiFi).
export const PEN_STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
};

export function PenConnectionProvider({ children }) {
  const { settings } = useSettings();

  const [wifiStatus, setWifiStatus] = useState(WIFI_STATUS.UNKNOWN);
  const [currentSsid, setCurrentSsid] = useState(null);
  const [wifiBusy, setWifiBusy] = useState(false);
  const [permissionIssue, setPermissionIssue] = useState(null);

  const [penStatus, setPenStatus] = useState(PEN_STATUS.IDLE);
  const [penInfo, setPenInfo] = useState(null); // { devId, devName, battery, wifiName, version, ... }
  const [penError, setPenError] = useState(null);

  const [captureBusy, setCaptureBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [lastCapture, setLastCapture] = useState(null); // { imagePath, aiText, capturedAt }

  const [log, setLog] = useState([]);
  const clientRef = useRef(null);
  // Ref sempre aggiornato all'ultima versione di capture(): usato dal
  // listener del telecomando Bluetooth per evitare di dover
  // ri-registrare/de-registrare il listener nativo ogni volta che capture
  // cambia identità (es. quando captureBusy passa da false a true durante
  // lo scatto stesso), il che rischierebbe di perdere un evento tasto nella
  // finestra di resubscribe.
  const captureRef = useRef(() => {});

  const pushLog = useCallback((msg) => {
    setLog((prev) => [...prev.slice(-200), { t: Date.now(), msg }]);
  }, []);

  const clearLog = useCallback(() => setLog([]), []);

  const ssidPrefix = settings.pen.ssidPrefix || DEFAULT_SSID_PREFIX;

  // Controlla lo stato WiFi corrente rispetto alla rete della penna. Va
  // richiamata ad ogni focus della Home e quando l'app torna in foreground,
  // perché l'utente può cambiare rete dalle impostazioni di sistema in
  // qualsiasi momento senza passare dall'app.
  const refreshWifiStatus = useCallback(async () => {
    const perm = await ensurePermissions();
    if (!perm.ok) {
      setPermissionIssue(perm);
      setWifiStatus(WIFI_STATUS.UNKNOWN);
      setCurrentSsid(null);
      return;
    }
    setPermissionIssue(null);
    const ssid = await getCurrentSSID();
    setCurrentSsid(ssid);
    setWifiStatus(isPenNetwork(ssid, ssidPrefix) ? WIFI_STATUS.PEN_NETWORK : WIFI_STATUS.NOT_PEN);
  }, [ssidPrefix]);

  useEffect(() => {
    refreshWifiStatus();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshWifiStatus();
    });
    return () => sub.remove();
  }, [refreshWifiStatus]);

  // Elenco reti WiFi filtrate per prefisso, utile se l'utente vuole
  // scegliere la rete da una lista invece di affidarsi alle impostazioni
  // di sistema.
  const scanForPenNetworks = useCallback(async () => {
    const perm = await ensurePermissions();
    if (!perm.ok) {
      setPermissionIssue(perm);
      return [];
    }
    setPermissionIssue(null);
    try {
      return await scanPenNetworks(ssidPrefix);
    } catch (e) {
      pushLog(`Scansione WiFi fallita: ${e.message}`);
      return [];
    }
  }, [ssidPrefix, pushLog]);

  // Non rilancia l'errore: è già loggato qui, e i chiamanti in UI lo
  // invocano "fire and forget" da un onPress (non c'è nessuno pronto a
  // gestire un reject a valle, il che altrimenti produrrebbe un unhandled
  // promise rejection).
  const joinPenNetwork = useCallback(async (ssid, password = null) => {
    setWifiBusy(true);
    try {
      pushLog(`Connessione WiFi a "${ssid}"...`);
      await connectToPen(ssid, password);
      await refreshWifiStatus();
      pushLog('WiFi connesso.');
    } catch (e) {
      pushLog(`Connessione WiFi fallita: ${e.message}`);
    } finally {
      setWifiBusy(false);
    }
  }, [pushLog, refreshWifiStatus]);

  const leavePenNetwork = useCallback(async () => {
    // Chiudere prima la sessione applicativa: non ha senso restare "loggati"
    // alla penna se si lascia la rete che la porta.
    await disconnectPenSession();
    setWifiBusy(true);
    try {
      await disconnectFromPen();
    } finally {
      setWifiBusy(false);
      await refreshWifiStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshWifiStatus]);

  // --- Sessione applicativa verso la penna (richiede WIFI_STATUS.PEN_NETWORK) ---

  // Non rilancia l'errore: viene chiamata direttamente da un onPress in UI
  // (nessun chiamante è pronto a gestire un reject a valle). Lo stato di
  // errore è già esposto tramite penStatus/penError per la UI.
  const connectPenSession = useCallback(async () => {
    if (wifiStatus !== WIFI_STATUS.PEN_NETWORK) {
      setPenError('Non sei connesso alla rete della penna: connettiti prima al WiFi.');
      setPenStatus(PEN_STATUS.ERROR);
      return;
    }

    const deviceIp = settings.pen.ip || DEFAULT_PEN_IP;
    setPenStatus(PEN_STATUS.CONNECTING);
    setPenError(null);

    try {
      let devId = null;
      let discoveryInfo = null;
      try {
        pushLog('Richiesta devId alla penna (discovery)...');
        discoveryInfo = await discoverDevice({ deviceIp });
        devId = discoveryInfo.devId;
        pushLog(`Penna identificata: ${discoveryInfo.devName || devId} (batteria ${discoveryInfo.battery ?? '?'}%)`);
      } catch (e) {
        devId = extractDevIdFromSsid(currentSsid);
        pushLog(`Discovery non riuscita (${e.message}). Uso il devId dedotto dal SSID: ${devId || 'non determinato'}`);
      }

      const client = new NaxclowClient({ deviceIp, ssid: currentSsid, devId });
      pushLog(`Apertura connessione TCP a ${deviceIp}:6123...`);
      await client.connect();

      pushLog('Login sulla penna...');
      await client.login();

      const status = await client.queryStatus();
      if (status) {
        pushLog(`Stato penna: batteria ${status.devPower ?? '?'}%, wifi "${status.wifiName ?? '?'}", fw ${status.version ?? '?'}`);
      }

      client.startLiveView();
      clientRef.current = client;

      setPenInfo({
        devId,
        devName: discoveryInfo?.devName,
        devModel: discoveryInfo?.devModel,
        battery: status?.devPower ?? discoveryInfo?.battery,
        wifiName: status?.wifiName,
        firmwareVersion: status?.version,
      });
      setPenStatus(PEN_STATUS.CONNECTED);
      pushLog('Sessione penna attiva.');
    } catch (e) {
      setPenStatus(PEN_STATUS.ERROR);
      setPenError(e.message);
      pushLog(`Errore sessione penna: ${e.message}`);
    }
  }, [wifiStatus, settings.pen.ip, currentSsid, pushLog]);

  const disconnectPenSession = useCallback(async () => {
    stopRemoteListener();
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
      pushLog('Sessione penna chiusa.');
    }
    setPenStatus(PEN_STATUS.IDLE);
    setPenInfo(null);
    setPenError(null);
  }, [pushLog]);

  // SOLO scatto: nessuna chiamata di rete verso AI/Telegram, così il
  // pulsante "Cattura" in UI mostra subito la foto senza aspettare
  // chiamate di rete lente. L'avvio della pipeline è un'azione separata
  // (vedi sendLastCapture), su richiesta esplicita dell'utente.
  const capture = useCallback(async () => {
    const client = clientRef.current;
    if (!client || penStatus !== PEN_STATUS.CONNECTED) {
      pushLog('Cattura ignorata: nessuna sessione penna attiva.');
      return null;
    }
    if (captureBusy) return null;

    setCaptureBusy(true);
    try {
      const imagePath = await captureSnapshot({ naxclowClient: client, onStatus: pushLog });
      const result = { imagePath, aiText: null, capturedAt: Date.now() };
      setLastCapture(result);
      return result;
    } catch (e) {
      // già loggato dentro captureSnapshot
      return null;
    } finally {
      setCaptureBusy(false);
    }
  }, [penStatus, captureBusy, pushLog]);

  // Avvia la pipeline AI/Telegram sull'ultimo scatto già visualizzato.
  // Azione separata e volontaria, innescata da un secondo pulsante in UI.
  const sendLastCapture = useCallback(async () => {
    if (!lastCapture || sendBusy) return null;

    const { valid, problems } = validateSettings(settings);
    if (!valid) {
      pushLog(`Impossibile avviare: impostazioni AI/Telegram incomplete (${problems.join(', ')}).`);
      return null;
    }

    setSendBusy(true);
    try {
      const aiText = await sendImageThroughPipeline({ imagePath: lastCapture.imagePath, settings, onStatus: pushLog });
      setLastCapture((prev) => (prev ? { ...prev, aiText } : prev));
      return aiText;
    } catch (e) {
      // già loggato dentro sendImageThroughPipeline
      return null;
    } finally {
      setSendBusy(false);
    }
  }, [lastCapture, sendBusy, settings, pushLog]);

  // Flusso automatico completo (scatto->AI->Telegram in un colpo), usato
  // SOLO dal telecomando Bluetooth: lì non c'è una UI passo-passo da
  // aspettare, quindi l'automazione end-to-end resta quella richiesta in
  // origine per l'uso "sul campo".
  const captureFromRemote = useCallback(async () => {
    const client = clientRef.current;
    if (!client || penStatus !== PEN_STATUS.CONNECTED) {
      pushLog('Scatto da telecomando ignorato: nessuna sessione penna attiva.');
      return;
    }
    if (captureBusy || sendBusy) return;

    const { valid, problems } = validateSettings(settings);
    setCaptureBusy(true);
    try {
      if (!valid) {
        pushLog(`Impostazioni AI/Telegram incomplete (${problems.join(', ')}): scatto solo la foto.`);
        const imagePath = await captureSnapshot({ naxclowClient: client, onStatus: pushLog });
        setLastCapture({ imagePath, aiText: null, capturedAt: Date.now() });
        return;
      }
      const result = await runCaptureToTelegramFlow({ naxclowClient: client, settings, onStatus: pushLog });
      setLastCapture({ ...result, capturedAt: Date.now() });
    } catch (e) {
      // già loggato dentro la pipeline
    } finally {
      setCaptureBusy(false);
    }
  }, [penStatus, captureBusy, sendBusy, settings, pushLog]);

  useEffect(() => {
    captureRef.current = captureFromRemote;
  }, [captureFromRemote]);

  useEffect(() => {
    if (penStatus === PEN_STATUS.CONNECTED) {
      startRemoteListener(settings.remote.triggerKeyCode, () => captureRef.current());
      return () => stopRemoteListener();
    }
    return undefined;
  }, [penStatus, settings.remote.triggerKeyCode]);

  useEffect(() => {
    // Se il WiFi lascia la rete della penna mentre la sessione è attiva,
    // la sessione applicativa non ha più senso: la chiudiamo di riflesso.
    if (wifiStatus === WIFI_STATUS.NOT_PEN && penStatus === PEN_STATUS.CONNECTED) {
      disconnectPenSession();
    }
  }, [wifiStatus, penStatus, disconnectPenSession]);

  useEffect(() => {
    return () => {
      if (clientRef.current) clientRef.current.close();
    };
  }, []);

  const value = {
    // wifi
    wifiStatus,
    currentSsid,
    wifiBusy,
    permissionIssue,
    ssidPrefix,
    refreshWifiStatus,
    scanForPenNetworks,
    joinPenNetwork,
    leavePenNetwork,
    // pen session
    penStatus,
    penInfo,
    penError,
    connectPenSession,
    disconnectPenSession,
    getClient: () => clientRef.current,
    // cattura + automazione
    capture,
    captureBusy,
    sendLastCapture,
    sendBusy,
    lastCapture,
    // log condiviso
    log,
    pushLog,
    clearLog,
  };

  return <PenConnectionContext.Provider value={value}>{children}</PenConnectionContext.Provider>;
}

export function usePenConnection() {
  const ctx = useContext(PenConnectionContext);
  if (!ctx) throw new Error('usePenConnection deve essere usato dentro PenConnectionProvider');
  return ctx;
}
