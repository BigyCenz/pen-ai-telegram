// Chiamata generica a un'API AI configurabile dall'utente (endpoint, chiave,
// modello, prompt). Di base è pensato per l'API Messages di Anthropic
// (immagine + testo), ma la funzione è scritta per essere facilmente
// adattabile ad altri provider cambiando solo buildRequestBody/parseResponse.
import RNFS from 'react-native-fs';

async function imageToBase64(imagePath) {
  return RNFS.readFile(imagePath, 'base64');
}

function buildRequestBody({ model, prompt, imageBase64 }) {
  // Formato compatibile con l'endpoint /v1/messages di Anthropic.
  return {
    model,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  };
}

function parseResponse(json) {
  // Estrae il primo blocco di testo dalla risposta; se si cambia provider
  // AI, adattare qui il parsing.
  const textBlock = (json.content || []).find((b) => b.type === 'text');
  return textBlock ? textBlock.text : JSON.stringify(json);
}

export async function analyzeImageWithAI({ endpoint, apiKey, model, prompt, imagePath }) {
  const imageBase64 = await imageToBase64(imagePath);
  const body = buildRequestBody({ model, prompt, imageBase64 });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Errore API AI (${response.status}): ${errText}`);
  }

  const json = await response.json();
  return parseResponse(json);
}
