// Gestione connessione WiFi alla penna + binding esplicito della rete dati
// mobile per le chiamate verso AI/Telegram, così il telefono resta agganciato
// al WiFi della penna ma le richieste internet passano comunque.
import WifiManager from 'react-native-wifi-reborn';
import { PermissionsAndroid, Platform, Linking } from 'react-native';
import * as Location from 'expo-location';
import { requestCellular, releaseCellular } from '../../modules/cellular-network/src';

// Confermato da cattura reale: la penna V720/Naxclow fa da gateway della
// propria rete AP a questo indirizzo. Resta comunque configurabile perché
// può variare tra firmware/modelli diversi.
export const DEFAULT_PEN_IP = '192.168.169.1';

// Su Android 13+ (API 33) serve NEARBY_WIFI_DEVICES per scan/connect WiFi;
// la costante potrebbe non esistere nelle versioni di RN più vecchie, quindi
// usiamo la stringa raw come fallback.
const NEARBY_WIFI_DEVICES =
  PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES || 'android.permission.NEARBY_WIFI_DEVICES';

// Nomi leggibili dei permessi Android, per messaggi comprensibili in UI
// invece di stringhe tecniche tipo "android.permission.ACCESS_FINE_LOCATION".
const PERMISSION_LABELS = {
  'android.permission.ACCESS_FINE_LOCATION': 'Posizione',
  'android.permission.ACCESS_COARSE_LOCATION': 'Posizione',
  'android.permission.NEARBY_WIFI_DEVICES': 'Dispositivi WiFi nelle vicinanze',
};

// Verifica (e se serve richiede) tutto ciò che Android pretende per
// leggere/scansionare le reti WiFi. Restituisce { ok: true } oppure
// { ok: false, reason, actionLabel, openSettings } dove:
//   - reason: spiegazione in italiano di cosa manca, mostrabile così com'è
//   - actionLabel: testo del pulsante che porta l'utente a risolvere
//   - openSettings: azione collegata a quel pulsante
// Ci sono tre cause distinte, ognuna con la propria azione dedicata:
//   1) permessi app non concessi (richiesti qui; se Android li blocca
//      definitivamente si può solo passare dalle impostazioni dell'app)
//   2) Servizi di localizzazione di sistema spenti
//   3) WiFi del telefono spento
export async function ensurePermissions() {
  if (Platform.OS !== 'android') return { ok: true };

  const apiLevel = Platform.Version; // numero API su Android

  const permissionsToRequest = [
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ];

  // NEARBY_WIFI_DEVICES esiste solo da API 33 in su: richiederlo su versioni
  // precedenti causa l'errore nativo "permission is null".
  if (apiLevel >= 33) {
    permissionsToRequest.push(NEARBY_WIFI_DEVICES);
  }

  const granted = await PermissionsAndroid.requestMultiple(permissionsToRequest);

  const denied = Object.entries(granted).filter(([, v]) => v !== PermissionsAndroid.RESULTS.GRANTED);

  if (denied.length > 0) {
    const names = [...new Set(denied.map(([k]) => PERMISSION_LABELS[k] || k))];
    return {
      ok: false,
      reason: `Per cercare e collegarsi alla rete della penna servono questi permessi: ${names.join(', ')}. Concedili dalle impostazioni dell'app.`,
      actionLabel: "Apri impostazioni dell'app",
      openSettings: () => Linking.openSettings(),
    };
  }

  // Oltre al PERMESSO (concesso sopra), Android richiede che i Servizi di
  // localizzazione di sistema siano ACCESI per poter scansionare/leggere
  // reti WiFi: sono due cose distinte, un permesso concesso con la
  // localizzazione spenta fallisce comunque con errori poco chiari lato
  // libreria nativa.
  try {
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      return {
        ok: false,
        reason: 'I Servizi di localizzazione del telefono sono disattivati: Android li richiede per cercare le reti WiFi. Attivali e poi torna qui.',
        actionLabel: 'Attiva la localizzazione',
        openSettings: () =>
          Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings()),
      };
    }
  } catch (e) {
    // Se il controllo stesso fallisce non blocchiamo l'utente qui: lo scan
    // darà comunque un errore se il problema era davvero questo.
  }

  try {
    const wifiEnabled = await WifiManager.isEnabled();
    if (!wifiEnabled) {
      return {
        ok: false,
        reason: 'Il WiFi del telefono è spento. Attivalo per collegarti alla rete della penna.',
        actionLabel: 'Apri impostazioni WiFi',
        openSettings: () => openWifiSettings(),
      };
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

// Esegue una funzione async DOPO aver richiesto esplicitamente la rete
// dati mobile e bindato il processo a quella (non solo "sciolto" il
// binding sul WiFi), e ripristina sempre il binding sul WiFi della penna
// al termine (successo o errore).
//
// PERCHÉ SERVE UN MODULO NATIVO DEDICATO (storia del bug):
// connectToPen() chiama forceWifiUsageWithOptions(true, ...) per
// instradare TUTTE le richieste di rete dell'app sul WiFi della penna
// (necessario per parlarci, dato che non ha internet). Il primo tentativo
// di fix chiamava solo releaseWifiForcing() (= bindProcessToNetwork(null))
// prima delle chiamate esterne, per "lasciare scegliere ad Android".
// Confermato con una cattura di rete reale (pen3.pcap) che questo NON
// basta: bindProcessToNetwork(null) scioglie il binding esplicito, ma non
// rilascia la richiesta di rete WiFi che connectToPen() ha attivato con
// requestNetwork() — quella richiesta resta viva, e su questo device (e
// non solo, vedi i molti report simili in giro per bindProcessToNetwork)
// Android continua comunque a preferire il WiFi per la risoluzione DNS e
// le connessioni, anche se dichiarato "senza internet". Risultato: la
// richiesta va in timeout con WiFi acceso, ma funziona subito se il WiFi
// viene spento manualmente — la prova che il problema era il routing, non
// il codice della chiamata AI/Telegram in sé.
//
// La fix corretta, implementata nel modulo nativo modules/cellular-network:
// richiede esplicitamente TRANSPORT_CELLULAR con requestNetwork() e, alla
// callback onAvailable, chiama bindProcessToNetwork(quella rete) — non
// null. Questo forza davvero le richieste del processo sui dati mobili.
//
// ssidPrefix è opzionale: il chiamante lo passa quando conosce il prefisso
// configurato dall'utente nelle Impostazioni (può differire dal default
// "Nax_"), così il controllo "sono ancora sulla rete della penna?" sotto è
// corretto anche con un prefisso personalizzato, non solo con quello di
// default.
export async function withMobileNetwork(fn, ssidPrefix) {
  if (Platform.OS !== 'android') {
    // Il modulo nativo è Android-only (vedi CellularNetworkModule.web.ts,
    // no-op): su altre piattaforme non c'è il problema di
    // bindProcessToNetwork legato a questa libreria WiFi.
    return fn();
  }

  // Se NON si è sulla rete della penna, la rete attuale è quella normale
  // del telefono (con internet): forzare i dati mobili sarebbe inutile,
  // consumerebbe traffico dati e, senza SIM/dati attivi, farebbe solo
  // aspettare il timeout di requestCellular() prima di ogni chiamata.
  const currentSsid = await getCurrentSSID();
  if (!isPenNetwork(currentSsid, ssidPrefix)) {
    return fn();
  }

  try {
    await requestCellular(8000);
  } catch (e) {
    console.warn('Impossibile agganciarsi alla rete cellulare esplicitamente, procedo comunque (potrebbe fallire):', e.message);
    // Non blocchiamo la chiamata: se i dati mobili sono davvero assenti,
    // fn() fallirà comunque più sotto con un errore di rete chiaro; se
    // invece erano già disponibili per altri motivi, potrebbe funzionare.
  }

  try {
    return await fn();
  } finally {
    releaseCellular();
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

export function isPenNetwork(ssid, prefix) {
  // Prefisso vuoto/non impostato = default "Nax_" (le Impostazioni salvano
  // una stringa vuota finché l'utente non lo personalizza: un parametro
  // di default JS non scatterebbe, perché '' non è undefined).
  const effectivePrefix = prefix || DEFAULT_SSID_PREFIX;
  if (!ssid) return false;
  return ssid.toLowerCase().startsWith(effectivePrefix.toLowerCase());
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
