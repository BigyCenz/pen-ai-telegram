// Invio foto + didascalia (risposta AI) alla chat Telegram tramite bot.

// Traduce gli errori della Bot API in messaggi comprensibili: la risposta
// grezza ("Unauthorized", "Bad Request: chat not found", ...) non dice
// all'utente cosa correggere nelle Impostazioni.
function friendlyTelegramError(status, description) {
  const d = (description || '').toLowerCase();
  if (status === 401 || status === 404) {
    return 'Bot token Telegram non valido: controllalo nelle Impostazioni.';
  }
  if (d.includes('chat not found')) {
    return 'Chat ID Telegram non trovato. Controlla l\'ID e assicurati di aver prima scritto almeno un messaggio al bot.';
  }
  if (d.includes('bot was blocked')) {
    return 'Il bot è stato bloccato da questa chat: sbloccalo da Telegram.';
  }
  if (status === 429) {
    return 'Telegram ha risposto "troppe richieste": riprova tra qualche secondo.';
  }
  return `Telegram ha rifiutato l'invio${description ? `: ${description}` : ` (codice ${status})`}.`;
}

async function callTelegram(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (e) {
    throw new Error(`Impossibile raggiungere Telegram: nessuna connessione a internet disponibile in questo momento. Dettaglio: ${e.message}`);
  }
  let json = null;
  try {
    json = await response.json();
  } catch (e) {
    // risposta non JSON: gestita sotto come errore generico per status
  }
  if (!response.ok || !json || !json.ok) {
    throw new Error(friendlyTelegramError(response.status, json && json.description));
  }
  return json;
}

export async function sendPhotoToTelegram({ botToken, chatId, imagePath, caption }) {
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;

  const formData = new FormData();
  formData.append('chat_id', chatId);
  if (caption) formData.append('caption', caption.slice(0, 1024)); // limite Telegram
  formData.append('photo', {
    uri: imagePath.startsWith('file://') ? imagePath : `file://${imagePath}`,
    name: 'snapshot.jpg',
    type: 'image/jpeg',
  });

  return callTelegram(url, { method: 'POST', body: formData });
}

export async function sendTextToTelegram({ botToken, chatId, text }) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  return callTelegram(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
