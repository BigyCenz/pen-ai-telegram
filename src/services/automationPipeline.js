// Orchestratore del flusso: scatto -> salvataggio locale -> AI -> Telegram.
// Riceve le dipendenze (client penna + settings) e restituisce funzioni
// pronte da collegare al trigger del telecomando o al pulsante manuale in UI.
import RNFS from 'react-native-fs';
import { analyzeImageWithAI } from './aiService';
import { sendPhotoToTelegram, sendTextToTelegram } from './telegramService';

async function saveSnapshotToDisk(buffer) {
  const path = `${RNFS.CachesDirectoryPath}/snapshot_${Date.now()}.jpg`;
  await RNFS.writeFile(path, buffer.toString('base64'), 'base64');
  return path;
}

// onStatus è un callback opzionale per aggiornare la UI passo per passo
// (es. "Scatto in corso...", "Analisi AI...", "Invio a Telegram...").
export async function runCaptureToTelegramFlow({ naxclowClient, settings, onStatus }) {
  const notify = (msg) => onStatus && onStatus(msg);

  try {
    notify('Richiesta snapshot alla penna...');
    const frameBuffer = await naxclowClient.requestSnapshot();

    notify('Salvataggio immagine locale...');
    const imagePath = await saveSnapshotToDisk(frameBuffer);

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
    return { imagePath, aiText };
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
