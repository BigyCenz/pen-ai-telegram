// I telecomandi otturatore Bluetooth economici emulano quasi sempre una
// tastiera HID che manda "volume up/down" (AVRCP). Basta intercettare
// l'evento hardware del tasto volume, senza bisogno di pairing BLE custom:
// una volta associato il telecomando nelle impostazioni Bluetooth del
// telefono, i tasti arrivano come normali eventi hardware.
import KeyEvent from 'react-native-keyevent';

// keyCode target configurabile dall'utente (default VOLUME_UP).
// Mappa i nomi leggibili ai keyCode Android reali.
const KEYCODE_MAP = {
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  CAMERA: 27,
  MEDIA_PLAY_PAUSE: 85,
};

let currentHandler = null;
let lastTriggerAt = 0;

// Tempo minimo tra due scatti: un tasto tenuto premuto (o un telecomando che
// manda eventi ripetuti/doppi) non deve far partire più scatti ravvicinati.
const TRIGGER_DEBOUNCE_MS = 1200;

export function startRemoteListener(triggerKeyName, onTrigger) {
  stopRemoteListener();

  const targetCode = KEYCODE_MAP[triggerKeyName] ?? KEYCODE_MAP.VOLUME_UP;

  currentHandler = (keyEvent) => {
    if (keyEvent.keyCode !== targetCode) return;
    const now = Date.now();
    if (now - lastTriggerAt < TRIGGER_DEBOUNCE_MS) return;
    lastTriggerAt = now;
    onTrigger();
  };

  // Gli eventi arrivano solo se MainActivity li inoltra al modulo: lo fa il
  // config plugin plugins/withKeyEvent.js (applicato da `expo prebuild`).
  // Nota: il tasto continua ad avere anche il suo effetto di sistema
  // (es. il volume cambia comunque), perché l'evento viene solo "osservato",
  // non consumato.
  KeyEvent.onKeyDownListener(currentHandler);
}

export function stopRemoteListener() {
  if (currentHandler) {
    KeyEvent.removeKeyDownListener();
    currentHandler = null;
  }
}

export const AVAILABLE_TRIGGER_KEYS = Object.keys(KEYCODE_MAP);
