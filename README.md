# Pen AI → Telegram

App React Native (Expo) che si collega direttamente all'Access Point WiFi di
una penna spia (famiglia A9 / Naxclow / app companion V720), riceve uno
snapshot al trigger di un telecomando otturatore Bluetooth, lo invia a
un'AI configurabile via API con un prompt personalizzabile, e inoltra la
risposta a una chat Telegram tramite bot.

## Struttura del progetto

```
App.js                          entry point + navigazione
src/
  theme.js                      colori, spaziatura, tipografia
  store/SettingsContext.js      impostazioni persistenti (AsyncStorage)
  services/
    naxclowClient.js            protocollo UDP verso la penna (AP diretto)
    wifiManager.js               scan/connessione WiFi + binding rete
    bluetoothRemoteListener.js  ascolto tasti hardware telecomando BT
    aiService.js                 chiamata API AI configurabile
    telegramService.js           invio foto/messaggi al bot Telegram
    automationPipeline.js        orchestrazione scatto -> AI -> Telegram
  screens/
    HomeScreen.js                connessione, scatto, log, anteprima
    SettingsScreen.js            configurazione AI / Telegram / penna / tasto
  components/
    Card.js, StatusBadge.js, ConfigField.js
```

## Requisiti tecnici importanti

Questo progetto usa moduli nativi (`react-native-wifi-reborn`,
`react-native-udp`, `react-native-keyevent`) che **non funzionano con Expo
Go**. Serve un dev client personalizzato:

```bash
npm install
npx expo prebuild
npx expo run:android          # build locale, richiede Android SDK
# oppure, se preferisci EAS Build (cloud, non richiede setup Android locale):
# eas build --profile development --platform android
```

## Protocollo della penna — CONFERMATO da cattura reale (30/09/2026)

Non più placeholder: il protocollo è stato ricavato da un'analisi diretta di
un file .pcap catturato dall'app V720 originale.

- **Trasporto**: TCP, porta 6123 (non UDP)
- **IP penna**: `192.168.169.1` (gateway della rete AP, configurabile nelle Impostazioni se il tuo firmware usa un indirizzo diverso)
- **Header di ogni messaggio** (20 byte): lunghezza payload (4B LE) + tipo messaggio (4B LE: 0=JSON, 1=chunk snapshot JPEG in chiaro, 4=chunk video live in formato diverso/non ancora decifrato) + 8 byte (placeholder ASCII "00000000" per i comandi JSON) + 4 byte finali
- **Login**: `{"unixTimer":...,"code":501,"target":"<devId>","token":"NaxclowToken"}` → risposta `status:200`
- **Comando snapshot**: `{"code":502,"content":{"devTarget":"<devId>","code":218}}` → risposta come sequenza di chunk tipo 1 da concatenare fino al marker JPEG di fine (`FF D9`)
- `devId` = parte dopo `Nax_` nel nome della rete WiFi della penna

**Nota**: lo streaming video continuo (tipo 4) usa un formato diverso da JPEG puro (probabilmente scrambled/proprietario) e non è ancora stato decodificato — l'app usa quindi snapshot ripetuti per l'anteprima "live" invece del vero streaming continuo, finché non si decifra anche quel formato.

## Cosa è già pronto e cosa va ancora verificato con la penna fisica in mano

**Pronto e stabile (non dipende dal modello preciso della penna):**
- Interfaccia completa (Home + Impostazioni)
- Persistenza impostazioni (AI, Telegram, penna, tasto trigger)
- Scan/connessione WiFi alla rete della penna
- Ascolto telecomando Bluetooth (tasto volume come trigger)
- Chiamata AI configurabile (endpoint, modello, chiave, prompt)
- Invio foto + risposta AI su Telegram
- Gestione errori con notifica di fallback su Telegram

**Da verificare/completare con la penna fisica in mano** (vedi commenti
`TODO` in `src/services/naxclowClient.js`):
- IP e porta esatti della penna in modalità AP
- Formato esatto del pacchetto di login e del comando di richiesta snapshot
  (byte esatti, ricavabili da packet capture con Wireshark o leggendo il
  codice sorgente del progetto open source `intx82/a9-v720`)
- Se il frame JPEG arriva in un solo pacchetto UDP o frammentato su più
  pacchetti (la funzione `requestSnapshot` va adattata di conseguenza)
- Comportamento reale di Android nel tenere attiva la connessione dati
  mobile mentre il WiFi è forzato sulla penna (varia leggermente tra
  versioni Android/produttori)

## Prossimo passo consigliato

Una volta accesa la penna, ripetere la cattura del traffico con Wireshark
(vedi procedura discussa in precedenza) puntata sulla richiesta di
snapshot dall'app originale V720, per confermare i byte esatti da mettere
in `buildLoginPacket()` e `buildSnapshotRequestPacket()`.
