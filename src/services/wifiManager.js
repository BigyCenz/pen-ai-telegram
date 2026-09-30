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

// Esegue una funzione async DOPO aver rilasciato il binding forzato sul
// WiFi della penna, e lo ri-applica sempre al termine (successo o errore).
//
// Perché serve: connectToPen() chiama forceWifiUsageWithOptions(true, ...)
// per instradare TUTTE le richieste di rete dell'app sul WiFi della penna
// (necessario per parlare con la penna stessa, che non ha internet). Ma
// questo blocca anche le chiamate verso servizi esterni (AI, Telegram):
// restano instradate sulla stessa rete senza internet e vanno in errore
// (timeout/connection refused), perché il binding forzato via
// bindProcessToNetwork() vale per TUTTO il processo, non per singola
// richiesta — non è selettivo tra "traffico verso la penna" e "traffico
// verso internet".
//
// releaseWifiForcing() chiama bindProcessToNetwork(null): sblocca il
// processo e lascia che Android scelga automaticamente la rete migliore
// per ogni richiesta (tipicamente la rete dati, dato che il WiFi è
// dichiarato "senza internet" con noInternet:true in connectToPen). Va
// però sempre ripristinato il binding sul WiFi dopo, altrimenti la
// successiva richiesta di scatto alla penna (che parla solo su quella
// rete IoT) rischia di uscire sulla rete dati invece che sul WiFi.
// ssidPrefix è opzionale: il chiamante lo passa quando conosce il prefisso
// configurato dall'utente nelle Impostazioni (può differire dal default
// "Nax_"), così il controllo "sono ancora sulla rete della penna?" sotto è
// corretto anche con un prefisso personalizzato, non solo con quello di
// default.
export async function withMobileNetwork(fn, ssidPrefix) {
  await releaseWifiForcing();
  try {
    return await fn();
  } finally {
    // Ripristina il forcing sul WiFi SOLO se si è ancora effettivamente
    // connessi a una rete della penna: se nel frattempo l'utente si è
    // disconnesso o è passato ad un'altra rete, ri-forzare instraderebbe
    // di nuovo tutto lì senza motivo (o peggio, su una rete sbagliata).
    try {
      const ssid = await getCurrentSSID();
      if (isPenNetwork(ssid, ssidPrefix)) {
        await WifiManager.forceWifiUsageWithOptions(true, { noInternet: true });
      }
    } catch (e) {
      console.warn('Errore ripristino routing WiFi verso la penna', e);
    }
  }
}

// Prefisso di default della famiglia di penne "Naxclow"/weihome: NON è il
// nome specifico di un singolo dispositivo, solo il pattern comune usato
// per riconoscere la rete giusta durante lo scan (resta configurabile
// nelle Impostazioni per modelli/firmware diversi, es. "Care_").
export const DEFAULT_SSID_PREFIX = 'Nax_';

// SSID della rete WiFi attualmente connessa (o null se non disponibile/non
// concesso il permesso). Alcune versioni Android racchiudono il SSID tra
// virgolette: vengono rimosse per un confronto pulito col prefisso.
export async function getCurrentSSID() {
  try {
    const ssid = await WifiManager.getCurrentWifiSSID();
    if (!ssid || ssid === '<unknown ssid>') return null;
    return ssid.replace(/^"(.*)"$/, '$1');
  } catch (e) {
    return null;
  }
}

export function isPenNetwork(ssid, prefix = DEFAULT_SSID_PREFIX) {
  if (!ssid || !prefix) return false;
  return ssid.toLowerCase().startsWith(prefix.toLowerCase());
}

// Apre le impostazioni WiFi di sistema, così l'utente può connettersi
// manualmente se lo scan in-app non trova la rete (es. throttling dello
// scan su Android recenti). Se l'intent specifico non è disponibile,
// ricade sulle impostazioni dell'app.
export function openWifiSettings() {
  if (Platform.OS === 'android' && typeof Linking.sendIntent === 'function') {
    return Linking.sendIntent('android.settings.WIFI_SETTINGS').catch(() => Linking.openSettings());
  }
  return Linking.openSettings();
}
