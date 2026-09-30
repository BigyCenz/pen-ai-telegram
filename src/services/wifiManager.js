// Gestione connessione WiFi alla penna + binding esplicito della rete dati
// mobile per le chiamate verso AI/Telegram, così il telefono resta agganciato
// al WiFi della penna ma le richieste internet passano comunque.
import WifiManager from 'react-native-wifi-reborn';
import { PermissionsAndroid, Platform, Linking } from 'react-native';

// Confermato da cattura reale: la penna V720/Naxclow fa da gateway della
// propria rete AP a questo indirizzo. Resta comunque configurabile perché
// può variare tra firmware/modelli diversi.
export const DEFAULT_PEN_IP = '192.168.169.1';

// Su Android 13+ (API 33) serve NEARBY_WIFI_DEVICES per scan/connect WiFi;
// la costante potrebbe non esistere nelle versioni di RN più vecchie, quindi
// usiamo la stringa raw come fallback.
const NEARBY_WIFI_DEVICES =
  PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES || 'android.permission.NEARBY_WIFI_DEVICES';

export async function ensurePermissions() {
  if (Platform.OS !== 'android') return { ok: true };

  const apiLevel = Platform.Version; // numero API su Android

  const permissionsToRequest = [
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ];

  // NEARBY_WIFI_DEVICES esiste solo da API 33 in su: richiederlo su versioni
  // precedenti causa l'errore nativo "permission is null" che stai vedendo.
  if (apiLevel >= 33) {
    permissionsToRequest.push(NEARBY_WIFI_DEVICES);
  }

  const granted = await PermissionsAndroid.requestMultiple(permissionsToRequest);

  const denied = Object.entries(granted).filter(
    ([, v]) => v !== PermissionsAndroid.RESULTS.GRANTED
  );

  if (denied.length > 0) {
    return {
      ok: false,
      reason: `Permessi negati: ${denied.map(([k]) => k).join(', ')}.`,
      openSettings: () => Linking.openSettings(),
    };
  }

  // La scansione WiFi su Android richiede anche i Location Services attivi
  // a livello di sistema (non basta il permesso concesso): se sono spenti,
  // loadWifiList() fallisce con errori poco chiari.
  try {
    const wifiEnabled = await WifiManager.isEnabled();
    if (!wifiEnabled) {
      return { ok: false, reason: 'Il WiFi del telefono è spento. Attivalo e riprova.' };
    }
  } catch (e) {
    // isEnabled può non essere disponibile su tutte le versioni: non blocchiamo per questo
  }

  return { ok: true };
}

export async function scanPenNetworks(ssidPrefix = '') {
  const list = await WifiManager.loadWifiList();
  if (!ssidPrefix) return list;
  return list.filter((n) => n.SSID && n.SSID.startsWith(ssidPrefix));
}

// Si collega all'AP della penna. connectToSSID esiste solo su iOS in questa
// libreria: su Android va sempre usato connectToProtectedSSID, anche per
// reti aperte (passando password vuota/null e isWEP=false).
export async function connectToPen(ssid, password = null) {
  await WifiManager.connectToProtectedSSID(ssid, password || '', false, false);
  // Fondamentale: dice ad Android di instradare le richieste di rete
  // dell'app su questo WiFi anche se non porta a internet (altrimenti il
  // sistema disconnette automaticamente una rete "senza internet").
  await WifiManager.forceWifiUsageWithOptions(true, { noInternet: true });
}

// Rilascia il binding forzato sul WiFi: da chiamare prima delle chiamate
// verso AI/Telegram così quelle richieste passano sulla rete dati mobile,
// oppure gestito automaticamente a seconda della versione della libreria/
// del comportamento Android (va verificato su device reale, alcune versioni
// Android instradano già in automatico se il WiFi è "senza internet").
export async function releaseWifiForcing() {
  await WifiManager.forceWifiUsageWithOptions(false, {});
}

export async function disconnectFromPen() {
  try {
    await releaseWifiForcing();
    await WifiManager.disconnect();
  } catch (e) {
    console.warn('Errore disconnessione WiFi', e);
  }
}
