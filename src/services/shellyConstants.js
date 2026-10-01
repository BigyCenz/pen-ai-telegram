// Costanti e utilità del telecomando Shelly, SENZA dipendenze native: così
// SettingsContext e le schermate possono importarle senza caricare il
// modulo nativo BLE (che esiste solo in una build che lo include).
// Eventi del pulsante e azioni assegnabili (mostrati nelle Impostazioni).
export const SHELLY_EVENTS = [
  { id: 'single', label: 'Pressione singola' },
  { id: 'double', label: 'Doppia' },
  { id: 'triple', label: 'Tripla' },
  { id: 'long', label: 'Lunga' },
  { id: 'hold', label: 'Hold (tenuto premuto)' },
];

export const SHELLY_ACTIONS = [
  { id: 'none', label: 'Nessuna' },
  { id: 'capture_send', label: 'Scatta e invia' },
  { id: 'capture_only', label: 'Solo foto' },
];

export const DEFAULT_SHELLY_ACTIONS = {
  single: 'capture_send',
  double: 'none',
  triple: 'none',
  long: 'capture_only',
  hold: 'none',
};

const MAC_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
export const normalizeMac = (mac) => (mac || '').trim().toUpperCase();
export const isValidMac = (mac) => MAC_RE.test(normalizeMac(mac));
