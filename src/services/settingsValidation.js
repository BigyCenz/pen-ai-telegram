// Validazione rapida delle impostazioni prima di provare ad avviare l'analisi
// AI/Telegram, così l'utente capisce subito cosa manca invece di scoprirlo
// a metà flusso con un errore di rete criptico. I campi fatti solo di spazi
// contano come vuoti.
const isEmpty = (v) => !v || !String(v).trim();

export function validateSettings(settings) {
  const problems = [];

  if (isEmpty(settings.ai.endpoint)) problems.push("manca l'endpoint API della AI");
  if (isEmpty(settings.ai.apiKey)) problems.push('manca la chiave API della AI');
  if (isEmpty(settings.ai.model)) problems.push('manca il modello AI');
  if (isEmpty(settings.ai.prompt)) problems.push('manca il prompt per la AI');

  if (isEmpty(settings.telegram.botToken)) problems.push('manca il bot token Telegram');
  if (isEmpty(settings.telegram.chatId)) problems.push('manca la chat ID Telegram');

  return { valid: problems.length === 0, problems };
}
