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
import { startShellyListener, stopShellyListener } from '../services/shellyRemoteListener';
import { captureSnapshot, sendImageThroughPipeline, runCaptureToTelegramFlow } from '../services/automationPipeline';
import { validateSettings } from '../services/settingsValidation';
import { useSettings } from './SettingsContext';

const PenConnectionContext = createContext(null);

// Tempo minimo da rispettare tra la chiusura di una sessione TCP e
// l'apertura della successiva. Gli stack TCP embedded di questi dispositivi
// (penna) sono spesso a singola connessione: se la precedente non ha ancora
// finito di rilasciarsi lato device quando arriva un nuovo SYN, il device
// non risponde e l'handshake ping/pong (type=115) va in timeout — è la
// causa più comune dell'errore "la penna non ha risposto" subito dopo aver
// terminato una sessione e averne avviata subito un'altra.
const RECONNECT_COOLDOWN_MS = 1500;

// Traduce i messaggi tecnici interni (pensati per i log/debug) in messaggi
// comprensibili per l'utente in UI. Tenuto in un unico punto così la
// schermata di connessione e qualunque altro posto mostrino sempre lo
// stesso testo per lo stesso problema, invece di stringhe diverse a
// seconda di dove l'errore viene intercettato.
function friendlyPenError(message) {
  if (!message) return 'Errore sconosciuto nella connessione alla penna.';
  if (/ping\/pong|handshake|type[\s=]*115/i.test(message)) {
    return 'La penna non ha risposto alla connessione. Può succedere subito dopo aver terminato una sessione precedente: riprova tra qualche secondo.';
  }
  if (/timeout/i.test(message) && /login/i.test(message)) {
    return 'La penna non ha confermato il login in tempo. Riprova.';
  }
  if (/timeout/i.test(message) && /snapshot/i.test(message)) {
    return 'La penna non ha inviato lo scatto in tempo. Riprova.';
  }
  if (/econnrefused|network is unreachable|host is down/i.test(message)) {
    return 'Impossibile raggiungere la penna su questa rete. Verifica di essere ancora connesso al suo WiFi.';
  }
  return message;
}

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
  const [captureError, setCaptureError] = useState(null);
  const [sendError, setSendError] = useState(null);
  const [lastCapture, setLastCapture] = useState(null); // { imagePath, aiText, capturedAt }

  const [log, setLog] = useState([]);
  const clientRef = useRef(null);
  const lastDisconnectAtRef = useRef(0);
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

    // Rispetta un breve cooldown se una sessione precedente è stata chiusa
    // da poco: vedi commento su RECONNECT_COOLDOWN_MS per il perché.
    const msSinceDisconnect = Date.now() - lastDisconnectAtRef.current;
    if (lastDisconnectAtRef.current > 0 && msSinceDisconnect < RECONNECT_COOLDOWN_MS) {
      const waitMs = RECONNECT_COOLDOWN_MS - msSinceDisconnect;
      pushLog(`Attendo ${Math.ceil(waitMs / 100) / 10}s prima di riconnettermi (la sessione precedente si è appena chiusa)...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    // Fino a 3 tentativi complessivi: l'handshake iniziale (ping/pong) può
    // fallire per flakiness momentanea dello stack TCP embedded della
    // penna, soprattutto subito dopo una sessione precedente — un retry
    // automatico risolve la maggior parte di questi casi senza che
    // l'utente debba accorgersene o premere di nuovo "Connetti".
    const MAX_ATTEMPTS = 3;
    let lastError = null;
    // Esito della discovery, conservato tra un tentativo e l'altro: una
    // volta ottenuto il devId non serve richiederlo di nuovo ai retry.
    let devId = null;
    let discoveryInfo = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let client = null;
      try {
        if (attempt > 1) {
          pushLog(`Nuovo tentativo di connessione (${attempt}/${MAX_ATTEMPTS})...`);
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }

        if (!discoveryInfo) {
          try {
            pushLog('Richiesta devId alla penna (discovery)...');
            discoveryInfo = await discoverDevice({ deviceIp });
            devId = discoveryInfo.devId;
            pushLog(`Penna identificata: ${discoveryInfo.devName || devId} (batteria ${discoveryInfo.battery ?? '?'}%)`);
          } catch (e) {
            devId = devId || extractDevIdFromSsid(currentSsid);
            pushLog(`Discovery non riuscita (${e.message}). Uso il devId dedotto dal SSID: ${devId || 'non determinato'}`);
          }
        }

        client = new NaxclowClient({ deviceIp, ssid: currentSsid, devId });
        pushLog(`Apertura connessione TCP a ${deviceIp}:6123...`);
        await client.connect();

        pushLog('Login sulla penna...');
        await client.login();

        const status = await client.queryStatus();
        if (status) {
          pushLog(`Stato penna: batteria ${status.devPower ?? '?'}%, wifi "${status.wifiName ?? '?'}", fw ${status.version ?? '?'}`);
        }

        // Non avviamo più startLiveView() qui: parte in modo lazy al primo
        // scatto (dentro requestSnapshot), altrimenti la penna comincia a
        // martellare di dati la connessione fin da subito, anche restando
        // sulla schermata senza scattare, ed è quello che rendeva tutta la
        // UI lenta/bloccata appena connessi.
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
        return;
      } catch (e) {
        lastError = e;
        if (client) client.close();
        pushLog(`Tentativo ${attempt}/${MAX_ATTEMPTS} fallito: ${e.message}`);
      }
    }

    setPenStatus(PEN_STATUS.ERROR);
    setPenError(friendlyPenError(lastError?.message));
    pushLog(`Errore sessione penna: ${lastError?.message}`);
  }, [wifiStatus, settings.pen.ip, currentSsid, pushLog]);

  const disconnectPenSession = useCallback(async () => {
    stopRemoteListener();
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
      lastDisconnectAtRef.current = Date.now();
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
    setCaptureError(null);
    try {
      const imagePath = await captureSnapshot({ naxclowClient: client, onStatus: pushLog });
      const result = { imagePath, aiText: null, capturedAt: Date.now() };
      setLastCapture(result);
      return result;
    } catch (e) {
      // già loggato dentro captureSnapshot; qui va anche mostrato in UI,
      // non solo nel tab Log, altrimenti lo scatto fallisce "in silenzio"
      // agli occhi dell'utente sulla schermata Cattura.
      setCaptureError(friendlyPenError(e.message));
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
      const msg = `Impostazioni AI/Telegram incomplete (${problems.join(', ')}).`;
      pushLog(`Impossibile avviare: ${msg}`);
      setSendError(msg);
      return null;
    }

    setSendBusy(true);
    setSendError(null);
    try {
      const aiText = await sendImageThroughPipeline({ imagePath: lastCapture.imagePath, settings, onStatus: pushLog });
      setLastCapture((prev) => (prev ? { ...prev, aiText } : prev));
      return aiText;
    } catch (e) {
      // già loggato dentro sendImageThroughPipeline; vedi nota sopra su
      // capture() per il perché va mostrato anche qui, non solo nel log.
      setSendError(e.message);
      return null;
    } finally {
      setSendBusy(false);
    }
  }, [lastCapture, sendBusy, settings, pushLog]);

  // Flusso automatico completo (scatto->AI->Telegram in un colpo), usato
  // SOLO dal telecomando Bluetooth: lì non c'è una UI passo-passo da
  // aspettare, quindi l'automazione end-to-end resta quella richiesta in
  // origine per l'uso "sul campo".
  // mode: 'capture_send' (scatto -> AI -> Telegram, default) oppure
  // 'capture_only' (solo foto, utile per es. sulla pressione lunga dello Shelly).
  const captureFromRemote = useCallback(async (mode = 'capture_send') => {
    const client = clientRef.current;
    if (!client || penStatus !== PEN_STATUS.CONNECTED) {
      pushLog('Scatto da telecomando ignorato: nessuna sessione penna attiva.');
      return;
    }
    if (captureBusy || sendBusy) return;

    const { valid, problems } = validateSettings(settings);
    setCaptureBusy(true);
    setCaptureError(null);
    setSendError(null);
    try {
      if (!valid || mode === 'capture_only') {
        if (mode === 'capture_only') {
          pushLog('Telecomando: scatto solo la foto, senza invio.');
        } else {
          pushLog(`Impostazioni AI/Telegram incomplete (${problems.join(', ')}): scatto solo la foto.`);
        }
        const imagePath = await captureSnapshot({ naxclowClient: client, onStatus: pushLog });
        setLastCapture({ imagePath, aiText: null, capturedAt: Date.now() });
        return;
      }
      const result = await runCaptureToTelegramFlow({ naxclowClient: client, settings, onStatus: pushLog });
      setLastCapture({ ...result, capturedAt: Date.now() });
    } catch (e) {
      // già loggato dentro la pipeline; qui captureError copre sia lo
      // scatto che un eventuale fallimento dell'invio, dato che questo
      // flusso li esegue in sequenza come un'unica azione dal telecomando.
      setCaptureError(friendlyPenError(e.message));
    } finally {
      setCaptureBusy(false);
    }
  }, [penStatus, captureBusy, sendBusy, settings, pushLog]);

  useEffect(() => {
    captureRef.current = captureFromRemote;
  }, [captureFromRemote]);

  // Le azioni per evento Shelly si leggono da un ref, così cambiare la
  // mappatura nelle Impostazioni vale subito, senza riavviare la scansione BLE.
  const shellyActionsRef = useRef(settings.remote.shelly.actions);
  useEffect(() => {
    shellyActionsRef.current = settings.remote.shelly.actions;
  }, [settings.remote.shelly.actions]);

  useEffect(() => {
    if (penStatus !== PEN_STATUS.CONNECTED) return undefined;

    if (settings.remote.type === 'shelly') {
      startShellyListener({
        mac: settings.remote.shelly.mac,
        onLog: (msg) => pushLog(`[Shelly] ${msg}`),
        onEvent: (e) => {
          const action = shellyActionsRef.current[e.event] || 'none';
          pushLog(`[Shelly] ${e.event} da ${e.mac} (pacchetto ${e.packetId}, rssi ${e.rssi}) -> ${action}`);
          if (action === 'none') return;
          captureRef.current(action);
        },
      }).catch((err) => pushLog(`[Shelly] ascolto non avviato: ${err.message}`));
      return () => stopShellyListener();
    }

    startRemoteListener(settings.remote.triggerKeyCode, () => captureRef.current());
    return () => stopRemoteListener();
  }, [penStatus, settings.remote.type, settings.remote.triggerKeyCode, settings.remote.shelly.mac, pushLog]);

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
    captureError,
    sendLastCapture,
    sendBusy,
    sendError,
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
