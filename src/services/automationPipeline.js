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
export async function sendImageThroughPipeline({ imagePath, settings, onStatus }) {
  const notify = (msg) => onStatus && onStatus(msg);
  try {
    notify('Analisi con AI...');
    const aiText = await analyzeImageWithAI({
      endpoint: settings.ai.endpoint,
      apiKey: settings.ai.apiKey,
      model: settings.ai.model,
      prompt: settings.ai.prompt,
      imagePath,
    });

    notify('Invio a Telegram...');
    await sendPhotoToTelegram({
      botToken: settings.telegram.botToken,
      chatId: settings.telegram.chatId,
      imagePath,
      caption: aiText,
    });

    notify('Completato.');
    return aiText;
  } catch (err) {
    notify(`Errore: ${err.message}`);
    // Notifica anche su Telegram in caso di errore, se configurato, così
    // l'utente lo sa anche se non ha il telefono sotto controllo.
    if (settings.telegram.botToken && settings.telegram.chatId) {
      try {
        await sendTextToTelegram({
          botToken: settings.telegram.botToken,
          chatId: settings.telegram.chatId,
          text: `⚠️ Errore automazione penna: ${err.message}`,
        });
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
