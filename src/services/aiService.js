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

export async function analyzeImageWithAI({ endpoint, apiKey, provider: providerId, model, prompt, imagePath }) {
  const provider = getProviderById(providerId);
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

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Errore API AI (${response.status}): ${errText}`);
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
  if (!apiKey) throw new Error('Serve una chiave API valida per elencare i modelli.');

  const url = provider.buildModelsUrl
    ? provider.buildModelsUrl(provider.modelsEndpoint, apiKey)
    : provider.modelsEndpoint;

  const headers = provider.authHeaders(apiKey);

  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Errore nel recupero modelli (${response.status}): ${errText}`);
  }

  const json = await response.json();
  return provider.parseModelsList(json);
}
