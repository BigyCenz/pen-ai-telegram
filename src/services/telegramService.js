// Invio foto + didascalia (risposta AI) alla chat Telegram tramite bot.
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

  const response = await fetch(url, { method: 'POST', body: formData });
  const json = await response.json();
  if (!json.ok) {
    throw new Error(`Errore invio Telegram: ${json.description || 'sconosciuto'}`);
  }
  return json;
}

export async function sendTextToTelegram({ botToken, chatId, text }) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const json = await response.json();
  if (!json.ok) {
    throw new Error(`Errore invio Telegram: ${json.description || 'sconosciuto'}`);
  }
  return json;
}
