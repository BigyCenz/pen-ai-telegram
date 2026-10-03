# Pen AI → Telegram

App React Native (Expo) che si collega direttamente all'Access Point WiFi di
una penna con telecamera (famiglia A9 / Naxclow, app originale **V720**),
scatta una foto al comando di un telecomando otturatore Bluetooth, la invia a
un'AI a tua scelta (Anthropic, OpenAI o Gemini) con un prompt configurabile e
inoltra la risposta a una chat Telegram tramite un tuo bot.

Flusso automatico dal telecomando: **scatto → AI → Telegram**. Dall'app puoi
anche scattare e controllare la foto prima, e avviare l'invio solo quando vuoi.

## Come si usa

1. **Impostazioni** → scegli il provider AI, inserisci la chiave API, usa
   "Recupera modelli disponibili" e scegli il modello dalla lista; imposta il
   prompt, il token del bot Telegram e il chat ID; poi *Salva*.
2. **Penna** → passo 1: collega il telefono alla rete WiFi della penna
   (`Nax_…`); passo 2: *Connetti alla penna*.
3. **Cattura** → scatta dall'app, oppure premi il tasto del telecomando
   Bluetooth (di default il tasto "volume su") per l'intero flusso automatico.

Le richieste verso AI e Telegram escono automaticamente sui **dati mobili**,
anche mentre il WiFi resta agganciato alla penna (che non ha internet).

## Telecomando Shelly BLU Button1 (BLE, anche a schermo spento)

In **Impostazioni → Telecomando** scegli "Shelly BLU". Lo Shelly non si
associa al telefono: a ogni pressione trasmette pacchetti BLE (BTHome v2) e
l'app li legge con una scansione filtrata, tenuta viva da un servizio in
primo piano (notifica fissa, wake lock, WiFi lock) definito nel modulo
locale `modules/shelly-ble`.

1. **Impara pulsante** → premi una volta il tasto: l'app salva il MAC e
   ignora gli altri dispositivi BLE vicini (oppure inseriscilo a mano).
2. Per ogni evento (singola, doppia, tripla, lunga, hold) scegli l'azione:
   *Scatta e invia*, *Solo foto* o *Nessuna* (default: singola = scatta e
   invia, lunga = solo foto).
3. Tocca **Escludi l'app dall'ottimizzazione batteria** e consenti i permessi
   Bluetooth/notifiche, altrimenti Android può fermare l'ascolto a schermo
   spento.

L'ascolto parte quando la sessione con la penna è connessa. Ogni evento
ricevuto (e ogni errore di scansione) finisce nella schermata **Log**: al
primo test a schermo spento controlla lì cosa arriva davvero, perché il
comportamento del Bluetooth in background cambia da produttore a produttore.
Il pulsante deve avere la cifratura BTHome disattivata.

Serve una nuova build nativa (`npx expo prebuild --clean` + `run:android`):
il modulo `shelly-ble` e i nuovi permessi non esistono nei dev client già
installati.

## Build

Il progetto usa moduli nativi (`react-native-wifi-reborn`,
`react-native-tcp-socket`, `@expo/vector-icons`, `expo-location`, più il
modulo locale `modules/cellular-network`): **non funziona con Expo Go**, serve
un dev client. Dopo ogni modifica a dipendenze o plugin nativi:

```bash
npm install
npx expo prebuild --clean
npx expo run:android
```

## Struttura

```
App.js                           entry point + navigazione a tab
modules/cellular-network/        modulo nativo Kotlin: forza i dati mobili
scripts/generate_icons.py        rigenera icona/splash (colori di theme.js)
assets/                          icon, adaptive icon, splash, favicon
src/
  theme.js                       colori, spaziature, tipografia
  store/
    SettingsContext.js           impostazioni persistenti (AsyncStorage)
    PenConnectionContext.js      stato WiFi + sessione penna + cattura/invio
  services/
    naxclowClient.js             protocollo TCP della penna
    wifiManager.js               permessi, scan/connessione WiFi, routing rete
    aiProviders.js / aiService.js  provider AI (Anthropic, OpenAI, Gemini)
    telegramService.js           invio foto/messaggi al bot
    automationPipeline.js        scatto -> AI -> Telegram
    settingsValidation.js        controllo campi obbligatori
  screens/                       Penna, Cattura, Log, Impostazioni
  components/                    Card, StatusBadge, InfoRow, BottomTabBar, ...
pen2.pcap, pen3.pcap             catture di rete usate per ricavare il protocollo
```

## Comportamenti da conoscere

- **Permessi**: se mancano i permessi (Posizione, Dispositivi WiFi vicini),
  la localizzazione di sistema è spenta o il WiFi è spento, la schermata
  Penna lo spiega e offre il pulsante che porta alla schermata giusta.
- **Riconnessione**: dopo "Termina sessione" l'app attende 1,5 s prima di
  riconnettersi e, se la penna non risponde all'handshake, riprova fino a 3
  volte (gli stack TCP embedded rilasciano la sessione precedente con
  ritardo).
- **Errori**: ogni errore mostrato all'utente è in italiano e dice cosa
  correggere (chiave API non valida, bot token errato, chat non trovata,
  penna non raggiungibile…); il dettaglio tecnico resta nella tab *Log*.
- **Modello AI**: si sceglie solo dalla lista recuperata dal provider (serve
  la chiave API); finché non la recuperi è disponibile solo il modello
  attualmente salvato.

## Protocollo della penna (da cattura reale, `pen2.pcap`)

TCP, porta 6123, IP `192.168.169.1` (gateway dell'AP, modificabile nelle
Impostazioni). Ogni messaggio ha un header di 20 byte: lunghezza payload
(uint32 LE), tipo (uint32 LE), 8 byte di placeholder (ASCII `00000000` per
tipo 0 e 100, zeri raw per gli altri), 4 byte finali (contatore sui chunk
immagine).

| Tipo | Significato |
|------|-------------|
| 0    | comando/risposta JSON |
| 1    | chunk di JPEG in chiaro |
| 4    | video live offuscato (formato non decifrato, ignorato) |
| 100  | keepalive (telefono → penna, ogni ~9 s) |
| 114  | discovery del `devId` (connessione breve a sé stante) |
| 115  | ping/pong iniziale prima del login |

Sequenza di sessione: discovery (114) → ping/pong (115) → login
(`code 501`, token `NaxclowToken`) → stato device (`502/code 4`) → live view
(`502/code 3`) → snapshot (`502/code 218`). Dopo l'avvio della live view la
penna trasmette in autonomia un flusso continuo di JPEG completi: lo
"snapshot" è il primo frame il cui inizio arriva dopo il comando.

## Sicurezza

Chiave API e token del bot sono salvati in chiaro nello storage locale
dell'app (AsyncStorage). Non committarli mai nel repository.
