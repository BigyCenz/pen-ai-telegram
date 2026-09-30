// Validazione rapida delle impostazioni prima di provare la connessione o
// il trigger, così l'utente capisce subito cosa manca invece di scoprirlo
// a metà flusso con un errore di rete criptico.
export function validateSettings(settings) {
  const problems = [];

  if (!settings.ai.endpoint) problems.push('Manca l\'endpoint API della AI');
  if (!settings.ai.apiKey) problems.push('Manca la chiave API della AI');
  if (!settings.ai.prompt) problems.push('Manca il prompt per la AI');

  if (!settings.telegram.botToken) problems.push('Manca il bot token Telegram');
  if (!settings.telegram.chatId) problems.push('Manca la chat ID Telegram');

  return { valid: problems.length === 0, problems };
}
