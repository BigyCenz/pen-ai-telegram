// Chiamata generica a un'API AI, ora multi-provider: la logica specifica
// di ogni provider (endpoint, auth, formato richiesta/risposta, elenco
// modelli) vive in aiProviders.js. Questo file resta il punto unico da cui
// il resto dell'app chiama "analizza l'immagine" e "elenca i modelli
// disponibili", senza sapere quale provider è configurato.
import RNFS from 'react-native-fs';
import { getProviderById } from './aiProviders';

async function imageToBase64(imagePath) {
  return RNFS.readFile(imagePath, 'base64');
}

// Estrae un messaggio leggibile da una risposta di errore HTTP, invece di
// mostrare mai il corpo JSON grezzo all'utente. Ogni provider ha un
// formato di errore diverso (vedi i commenti inline), ma tutti finiscono
// qui con lo stesso trattamento: proviamo a leggere il campo "message"
// specifico, altrimenti ricadiamo su un messaggio generico per status code
// (401/403 = chiave non valida, è il caso più comune), mai sul testo
// grezzo della risposta.
function friendlyApiError(provider, status, rawText) {
  let parsedMessage = null;
  try {
    const parsed = JSON.parse(rawText);
    // Anthropic: {"type":"error","error":{"type":"...","message":"..."}}
    // OpenAI:    {"error":{"message":"...","type":"...","code":"..."}}
    // Gemini:    {"error":{"code":401,"message":"...","status":"..."}}
    parsedMessage = parsed?.error?.message || parsed?.message || null;
  } catch (e) {
    // corpo non JSON (es. pagina HTML di errore): ignorato, si ricade sul
    // messaggio generico sotto
  }

  if (status === 401 || status === 403) {
    return `Chiave API di ${provider.label} non valida, scaduta o senza i permessi necessari.`;
  }
  if (status === 429) {
    return `${provider.label} ha risposto "troppe richieste" (rate limit). Riprova tra poco.`;
  }
  if (parsedMessage) {
    return `${provider.label}: ${parsedMessage}`;
  }
  return `${provider.label} ha risposto con un errore (codice ${status}).`;
}

export async function analyzeImageWithAI({ endpoint, apiKey, provider: providerId, model, prompt, imagePath }) {
  const provider = getProviderById(providerId);
  if (!apiKey) {
    throw new Error(`Serve una chiave API di ${provider.label} per analizzare l'immagine: inseriscila nelle Impostazioni.`);
  }
  const imageBase64 = await imageToBase64(imagePath);
  const body = provider.buildRequestBody({ model, prompt, imageBase64 });

  // Gemini costruisce l'URL finale in modo diverso (modello+key nella URL
  // invece che in header/body): i provider "standard" (Anthropic, OpenAI)
  // non definiscono buildEndpointUrl e usano semplicemente l'endpoint
  // configurato più gli header di autenticazione.
  const url = provider.buildEndpointUrl
    ? provider.buildEndpointUrl(endpoint, { model, apiKey })
    : endpoint || provider.defaultEndpoint;

  const headers = {
    'Content-Type': 'application/json',
    ...provider.authHeaders(apiKey),
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(
      `Impossibile raggiungere ${provider.label}: nessuna connessione a internet disponibile in questo momento. Dettaglio: ${e.message}`
    );
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(friendlyApiError(provider, response.status, errText));
  }

  const json = await response.json();
  return provider.parseResponse(json);
}

// Interroga l'API del provider per ottenere l'elenco dei modelli
// disponibili con quella chiave, invece di doverli scrivere a mano nelle
// Impostazioni. Restituisce [{ id, label }], ordinati come li restituisce
// il provider (Anthropic li elenca già dal più recente).
export async function fetchAvailableModels({ provider: providerId, apiKey }) {
  const provider = getProviderById(providerId);
  if (!apiKey) {
    // Controllo esplicito qui (non solo lato UI): questa funzione può
    // essere richiamata anche da altri punti in futuro, e senza chiave
    // tutti e tre i provider (Anthropic, OpenAI, Gemini) rifiutano la
    // richiesta — meglio un messaggio chiaro subito che un giro di rete
    // a vuoto seguito da un errore HTTP da interpretare.
    throw new Error(`Inserisci prima la chiave API di ${provider.label} per recuperare i modelli disponibili.`);
  }

  const url = provider.buildModelsUrl
    ? provider.buildModelsUrl(provider.modelsEndpoint, apiKey)
    : provider.modelsEndpoint;

  const headers = provider.authHeaders(apiKey);

  let response;
  try {
    response = await fetch(url, { method: 'GET', headers });
  } catch (e) {
    // La richiesta non ha nemmeno raggiunto il server (es. instradata
    // sulla rete WiFi della penna, senza internet): errore di rete, non
    // di autenticazione/API. Messaggio distinto apposta, per non
    // confonderlo con una chiave sbagliata durante il debug.
    throw new Error(
      `Impossibile raggiungere ${provider.label}: nessuna connessione a internet disponibile in questo momento (verifica di non essere ancora instradato sulla rete della penna). Dettaglio: ${e.message}`
    );
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(friendlyApiError(provider, response.status, errText));
  }

  const json = await response.json();
  return provider.parseModelsList(json);
}
