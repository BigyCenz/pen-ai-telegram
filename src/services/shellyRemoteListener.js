// Telecomando Shelly BLU Button1 (BLE, BTHome v2).
//
// Lo Shelly non si collega mai al telefono: a ogni pressione trasmette
// pacchetti di advertising. Quindi non serve associarlo; basta una scansione
// BLE filtrata, tenuta viva da un servizio in primo piano (vedi
// modules/shelly-ble) per funzionare anche a schermo spento.
import { PermissionsAndroid, Platform } from 'react-native';
import {
  startRemote,
  stopRemote,
  addButtonListener,
  addLogListener,
  addTickListener,
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
} from '../../modules/shelly-ble/src';
import { normalizeMac, isValidMac } from './shellyConstants';
import { pumpTimers } from './bgTimers';

// Stato del modulo: un solo servizio, quindi un solo "ascoltatore attivo".
let buttonSub = null;
let logSub = null;
let tickSub = null;
let running = false;
let currentMac = null;
let currentHandlers = null; // { onEvent, onLog, onTick }
let learnResolver = null; // se non null, il prossimo evento viene usato per imparare il MAC
// Dopo "impara pulsante" il servizio nativo viene riavviato e la stessa
// pressione (il pulsante ripete il pacchetto più volte) arriverebbe di nuovo
// come evento "vero", facendo partire l'azione associata. Per qualche
// secondo dopo l'apprendimento gli eventi vengono quindi ignorati.
const LEARN_QUIET_MS = 6000;
let quietUntil = 0;
// Contatore per scartare un avvio ancora in attesa dei permessi se nel
// frattempo è arrivato uno stop (o un nuovo avvio).
let generation = 0;

function ensureSubscriptions() {
  if (!buttonSub) {
    buttonSub = addButtonListener((e) => {
      if (learnResolver) {
        const resolve = learnResolver;
        learnResolver = null;
        resolve(e);
        return;
      }
      if (Date.now() < quietUntil) {
        currentHandlers?.onLog?.(`evento ${e.event} ignorato: è la pressione usata per imparare il pulsante`);
        return;
      }
      currentHandlers?.onEvent?.(e);
    });
  }
  if (!logSub) {
    logSub = addLogListener((e) => currentHandlers?.onLog?.(e.message));
  }
  if (!tickSub) {
    // Battito nativo (1/s, anche a schermo spento): fa scattare i timer JS
    // scaduti e dà il ritmo a keepalive e watchdog della sessione penna.
    tickSub = addTickListener(() => {
      pumpTimers();
      currentHandlers?.onTick?.();
    });
  }
}

function dropSubscriptions() {
  buttonSub?.remove();
  logSub?.remove();
  tickSub?.remove();
  buttonSub = null;
  logSub = null;
  tickSub = null;
}

// Chiede i permessi runtime necessari. Restituisce { ok, missing }.
// BLUETOOTH_SCAN è runtime solo da Android 12; POST_NOTIFICATIONS da 13 (se
// negato il servizio parte lo stesso, ma la notifica fissa non si vede).
export async function ensureShellyPermissions() {
  if (Platform.OS !== 'android') return { ok: false, missing: ['android'] };
  const wanted = [];
  if (Platform.Version >= 31) {
    wanted.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
    wanted.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  } else {
    wanted.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  }
  if (Platform.Version >= 33) wanted.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);

  const result = await PermissionsAndroid.requestMultiple(wanted);
  const missing = wanted.filter((p) => result[p] !== PermissionsAndroid.RESULTS.GRANTED);
  // Senza notifiche si può proseguire; senza scansione no.
  const blocking = missing.filter((p) => p !== PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return { ok: blocking.length === 0, missing };
}

// Avvia il servizio in primo piano. Con un MAC valido ascolta il pulsante:
// onEvent riceve { mac, event, packetId, rssi } SOLO per quel MAC (filtro già
// nel nativo). Senza MAC valido il servizio parte lo stesso, senza scansione
// BLE: serve comunque a tenere viva la sessione con la penna a schermo spento
// (wake lock, WiFi lock e battito per keepalive e timer).
// onTick viene chiamato a ogni battito nativo (1 al secondo).
export async function startShellyListener({ mac, onEvent, onLog, onTick }) {
  const target = normalizeMac(mac);
  const scan = isValidMac(target);
  const gen = ++generation;
  const { ok } = await ensureShellyPermissions();
  if (gen !== generation) return; // fermato o riavviato mentre aspettavo i permessi
  if (scan && !ok) throw new Error('Permesso Bluetooth negato: serve per ascoltare il pulsante Shelly.');
  if (!scan) {
    onLog?.('Nessun pulsante configurato: il servizio resta attivo solo per tenere viva la sessione con la penna.');
  }

  currentHandlers = { onEvent, onLog, onTick };
  ensureSubscriptions();
  currentMac = scan ? target : null;
  startRemote(currentMac, scan);
  running = true;
}

export function stopShellyListener() {
  generation += 1;
  if (running) stopRemote();
  running = false;
  currentMac = null;
  currentHandlers = null;
  learnResolver = null;
  dropSubscriptions();
}

// Modalità "impara": ascolta qualunque dispositivo BTHome e restituisce il
// MAC del primo che manda un evento pulsante. Dopo (o in caso di
// timeout/errore) ripristina l'ascolto precedente, se c'era.
export async function learnShellyButton({ timeoutMs = 30000, onLog } = {}) {
  const { ok } = await ensureShellyPermissions();
  if (!ok) throw new Error('Permesso Bluetooth negato: serve per cercare il pulsante Shelly.');

  const previous = running ? { mac: currentMac, handlers: currentHandlers } : null;
  if (!currentHandlers) currentHandlers = { onLog };
  ensureSubscriptions();
  startRemote(null);
  running = true;

  try {
    const event = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        learnResolver = null;
        reject(new Error('Nessun pulsante rilevato: premilo vicino al telefono e riprova.'));
      }, timeoutMs);
      learnResolver = (e) => {
        clearTimeout(timer);
        quietUntil = Date.now() + LEARN_QUIET_MS;
        resolve(e);
      };
    });
    return event.mac;
  } finally {
    learnResolver = null;
    if (previous) {
      // Ripristina com'era: con scansione se c'era un MAC, altrimenti solo
      // servizio custode della sessione.
      currentMac = previous.mac;
      currentHandlers = previous.handlers;
      startRemote(previous.mac, !!previous.mac);
    } else {
      stopRemote();
      running = false;
      currentMac = null;
      currentHandlers = null;
      dropSubscriptions();
    }
  }
}

export function batteryOptimizationIgnored() {
  try {
    return isIgnoringBatteryOptimizations();
  } catch (_) {
    return false;
  }
}

export function openBatteryOptimizationRequest() {
  requestIgnoreBatteryOptimizations();
}
