// Orchestratore del flusso: scatto -> salvataggio locale -> AI -> Telegram.
// Diviso DELIBERATAMENTE in due funzioni separate (invece di un unico
// blocco monolitico) perché lo scatto deve poter essere visto subito in UI
// senza aspettare le chiamate di rete verso AI/Telegram, che possono
// impiegare diversi secondi: il pulsante "Cattura" usa solo
// captureSnapshot(), un pulsante separato "Avvia" usa sendImageThroughPipeline()
// sull'immagine già scattata. runCaptureToTelegramFlow() (le due unite in
// sequenza) resta disponibile per il flusso automatico dal telecomando
// Bluetooth, dove scatto->AI->Telegram deve avvenire tutto insieme.
import RNFS from 'react-native-fs';
import { analyzeImageWithAI } from './aiService';
import { sendPhotoToTelegram, sendTextToTelegram } from './telegramService';
import { withMobileNetwork } from './wifiManager';

// Errori transitori di rete (tipici a schermo spento, quando i dati mobili
// ci mettono un attimo a svegliarsi): vale la pena riprovare. Errori come
// token o chat ID sbagliati no.
function isTransientNetworkError(err) {
  return /network request failed|impossibile raggiungere|timeout|timed out|nessuna connessione|failed to connect|aborted/i.test(
    (err && err.message) || ''
  );
}

// Come withMobileNetwork, ma riprova (richiedendo di nuovo i dati mobili)
// se l'errore è di rete. assumePen: la pipeline gira con la sessione penna
// attiva, quindi l'SSID non leggibile non significa "ho già internet".
async function withMobileNetworkRetry(fn, ssidPrefix, attempts = 3) {
  let lastErr = null;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await withMobileNetwork(fn, ssidPrefix, { assumePen: true });
    } catch (e) {
      lastErr = e;
      if (i === attempts || !isTransientNetworkError(e)) throw e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw lastErr;
}

async function saveSnapshotToDisk(buffer) {
  const path = `${RNFS.CachesDirectoryPath}/snapshot_${Date.now()}.jpg`;
  await RNFS.writeFile(path, buffer.toString('base64'), 'base64');
  return path;
}

// Scatta e salva SOLO l'immagine: nessuna chiamata di rete verso AI o
// Telegram. Restituisce il path locale, pensato per essere mostrato subito.
export async function captureSnapshot({ naxclowClient, onStatus }) {
  const notify = (msg) => onStatus && onStatus(msg);
  notify('Richiesta snapshot alla penna...');
  const frameBuffer = await naxclowClient.requestSnapshot();
  notify('Salvataggio immagine locale...');
  const imagePath = await saveSnapshotToDisk(frameBuffer);
  notify('Scatto salvato.');
  return imagePath;
}

// Invia un'immagine GIÀ scattata alla AI e poi a Telegram. Separata dallo
// scatto così può essere avviata da un pulsante distinto, in un momento
// diverso rispetto al momento dello scatto.
// Tutte le chiamate di rete verso servizi esterni (AI, Telegram) sono
// avvolte in withMobileNetwork(): mentre il telefono è connesso al WiFi
// della penna, quel WiFi viene forzato come rotta di rete per l'intero
// processo (vedi wifiManager.connectToPen) perché è l'unico modo per
// parlare con la penna stessa (che non ha internet). Senza questo
// wrapper, le richieste verso AI/Telegram uscirebbero sulla stessa rete
// senza internet e fallirebbero con errori di rete generici, anche con
// dati mobili o altre reti disponibili e funzionanti.
export async function sendImageThroughPipeline({ imagePath, settings, onStatus }) {
  const notify = (msg) => onStatus && onStatus(msg);
  try {
    notify('Analisi con AI...');
    const aiText = await withMobileNetworkRetry(
      () =>
        analyzeImageWithAI({
          endpoint: settings.ai.endpoint,
          apiKey: settings.ai.apiKey,
          provider: settings.ai.provider,
          model: settings.ai.model,
          prompt: settings.ai.prompt,
          imagePath,
        }),
      settings.pen.ssidPrefix
    );

    notify('Invio a Telegram...');
    await withMobileNetworkRetry(
      () =>
        sendPhotoToTelegram({
          botToken: settings.telegram.botToken,
          chatId: settings.telegram.chatId,
          imagePath,
          caption: aiText,
        }),
      settings.pen.ssidPrefix
    );

    notify('Completato.');
    return aiText;
  } catch (err) {
    notify(`Errore: ${err.message}`);
    // Notifica anche su Telegram in caso di errore, se configurato, così
    // l'utente lo sa anche se non ha il telefono sotto controllo.
    if (settings.telegram.botToken && settings.telegram.chatId) {
      try {
        await withMobileNetworkRetry(
          () =>
            sendTextToTelegram({
              botToken: settings.telegram.botToken,
              chatId: settings.telegram.chatId,
              text: `⚠️ Errore automazione penna: ${err.message}`,
            }),
          settings.pen.ssidPrefix
        );
      } catch (_) {
        // se anche Telegram fallisce non c'è molto altro da fare qui
      }
    }
    throw err;
  }
}

// onStatus è un callback opzionale per aggiornare la UI passo per passo
// (es. "Scatto in corso...", "Analisi AI...", "Invio a Telegram...").
// Usato SOLO per il flusso automatico (telecomando Bluetooth): scatto e
// invio avvengono in sequenza senza intervento manuale, per riprodurre il
// comportamento "scatto->AI->Telegram automatico" richiesto in origine.
export async function runCaptureToTelegramFlow({ naxclowClient, settings, onStatus }) {
  const imagePath = await captureSnapshot({ naxclowClient, onStatus });
  const aiText = await sendImageThroughPipeline({ imagePath, settings, onStatus });
  return { imagePath, aiText };
}
