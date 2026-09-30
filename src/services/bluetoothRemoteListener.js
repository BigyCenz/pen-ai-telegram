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

export function startRemoteListener(triggerKeyName, onTrigger) {
  stopRemoteListener();

  const targetCode = KEYCODE_MAP[triggerKeyName] ?? KEYCODE_MAP.VOLUME_UP;

  currentHandler = (keyEvent) => {
    if (keyEvent.keyCode === targetCode) {
      onTrigger();
    }
  };

  // Intercetta l'evento PRIMA che il sistema lo usi per alzare/abbassare il
  // volume reale (altrimenti ogni scatto cambierebbe anche il volume media).
  KeyEvent.onKeyDownListener(currentHandler);
}

export function stopRemoteListener() {
  if (currentHandler) {
    KeyEvent.removeKeyDownListener();
    currentHandler = null;
  }
}

export const AVAILABLE_TRIGGER_KEYS = Object.keys(KEYCODE_MAP);
