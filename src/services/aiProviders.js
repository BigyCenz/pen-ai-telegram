// Definizione dei provider AI supportati: ognuno sa come costruire il
// proprio endpoint di default, gli header di autenticazione, il formato
// della richiesta (immagine+prompt), come leggere la risposta testuale, e
// come elencare i modelli disponibili tramite la propria API.
//
// Aggiungere un nuovo provider = aggiungere una entry qui, nient'altro:
// aiService.js e la UI delle Impostazioni leggono tutto da questa lista,
// non c'è logica specifica di un provider sparsa altrove.
//
// Fonti dei formati (verificati sulla documentazione ufficiale, 30/09/2026):
// - Anthropic Messages API: https://docs.anthropic.com/en/api/messages ,
//   Models API: https://platform.claude.com/docs/en/api/models/list
// - OpenAI Chat Completions (vision) + Models API:
//   https://platform.openai.com/docs/api-reference/models/list
// - Google Gemini generateContent (inline_data) + Models API:
//   https://ai.google.dev/gemini-api/docs/generate-content/image-understanding
//   https://ai.google.dev/api/models

export const AI_PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultEndpoint: 'https://api.anthropic.com/v1/messages',
    modelsEndpoint: 'https://api.anthropic.com/v1/models',
    defaultModel: 'claude-sonnet-4-6',

    authHeaders(apiKey) {
      return {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Anthropic richiede questo header per accettare chiamate dirette
        // da client "browser-like" (introdotto ad agosto 2024). Il fetch
        // nativo di React Native su Android/iOS non è un vero browser e
        // non applica CORS, quindi in teoria non ne avrebbe bisogno — ma
        // costa nulla mandarlo comunque come protezione aggiuntiva, nel
        // caso il polyfill fetch usato in un dato ambiente/build si
        // comporti in modo più simile a un browser.
        'anthropic-dangerous-direct-browser-access': 'true',
      };
    },

    buildRequestBody({ model, prompt, imageBase64 }) {
      return {
        model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      };
    },

    parseResponse(json) {
      const textBlock = (json.content || []).find((b) => b.type === 'text');
      return textBlock ? textBlock.text : JSON.stringify(json);
    },

    parseModelsList(json) {
      // { data: [{ id, display_name, ... }] }
      return (json.data || []).map((m) => ({ id: m.id, label: m.display_name || m.id }));
    },
  },

  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
    modelsEndpoint: 'https://api.openai.com/v1/models',
    defaultModel: 'gpt-4o',

    authHeaders(apiKey) {
      return { Authorization: `Bearer ${apiKey}` };
    },

    buildRequestBody({ model, prompt, imageBase64 }) {
      return {
        model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            ],
          },
        ],
      };
    },

    parseResponse(json) {
      const choice = (json.choices || [])[0];
      return choice?.message?.content ? choice.message.content : JSON.stringify(json);
    },

    parseModelsList(json) {
      // { data: [{ id, ... }] }, nessun nome leggibile separato: uso l'id
      // due volte, ma filtro ai soli modelli plausibilmente multimodali
      // (contengono "gpt-4", "gpt-5", "gpt-6", "o1", "o3", "o4" nell'id) per
      // evitare di proporre modelli text-only/embedding/whisper che
      // fallirebbero comunque su una richiesta con immagine.
      return (json.data || [])
        .filter((m) => /gpt-[4-9]|^o[1-9]/i.test(m.id))
        .map((m) => ({ id: m.id, label: m.id }));
    },
  },

  {
    id: 'gemini',
    label: 'Google (Gemini)',
    // L'endpoint reale include il nome modello e la key come query param
    // (vedi buildEndpointUrl): defaultEndpoint qui è solo il valore
    // mostrato/salvato di partenza in Impostazioni.
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    modelsEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-2.5-flash',

    // Gemini non usa un header Authorization: la key va come query param
    // sia sull'endpoint di generazione che su quello di lista modelli.
    authHeaders() {
      return {};
    },

    // Sostituisce {model} nell'endpoint configurato e aggiunge la key come
    // query param, invece di un header — a differenza degli altri due
    // provider dove l'endpoint è fisso e il modello va nel body.
    buildEndpointUrl(endpoint, { model, apiKey }) {
      const withModel = (endpoint || this.defaultEndpoint).replace('{model}', model);
      const sep = withModel.includes('?') ? '&' : '?';
      return `${withModel}${sep}key=${encodeURIComponent(apiKey)}`;
    },

    buildModelsUrl(modelsEndpoint, apiKey) {
      return `${modelsEndpoint}?key=${encodeURIComponent(apiKey)}`;
    },

    buildRequestBody({ prompt, imageBase64 }) {
      return {
        contents: [
          {
            parts: [
              { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
              { text: prompt },
            ],
          },
        ],
      };
    },

    parseResponse(json) {
      const text = json.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
      return text || JSON.stringify(json);
    },

    parseModelsList(json) {
      // { models: [{ name: "models/gemini-2.5-flash", displayName, supportedGenerationMethods }] }
      // Filtrati ai soli modelli che supportano generateContent (alcuni
      // modelli Gemini sono solo per embedding e non accettano immagini).
      return (json.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => ({ id: (m.name || '').replace(/^models\//, ''), label: m.displayName || m.name }));
    },
  },
];

export function getProviderById(providerId) {
  return AI_PROVIDERS.find((p) => p.id === providerId) || AI_PROVIDERS[0];
}

// Deduce il provider dal solo endpoint salvato: usato per retro-compatibilità
// con impostazioni salvate PRIMA dell'introduzione del campo esplicito
// settings.ai.provider (dove l'endpoint era l'unica cosa configurata).
export function guessProviderFromEndpoint(endpoint) {
  if (!endpoint) return AI_PROVIDERS[0].id;
  if (endpoint.includes('anthropic.com')) return 'anthropic';
  if (endpoint.includes('openai.com')) return 'openai';
  if (endpoint.includes('generativelanguage.googleapis.com')) return 'gemini';
  return AI_PROVIDERS[0].id;
}
