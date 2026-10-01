import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { guessProviderFromEndpoint } from '../services/aiProviders';

const STORAGE_KEY = '@pen_ai_telegram_settings_v1';

// Valori di default: l'utente li personalizza dalla schermata Impostazioni.
// Nulla è hardcoded: chiavi API, token e prompt restano sempre modificabili.
const DEFAULT_SETTINGS = {
  pen: {
    ssidPrefix: '', // vuoto = usa il default "Nax_" (vedi wifiManager.DEFAULT_SSID_PREFIX)
    ip: '', // vuoto = usa il default confermato (192.168.169.1)
    protocol: 'naxclow-v720', // 'naxclow-v720' | 'tutk-iotc' (per penne tipo weihome)
  },
  ai: {
    provider: 'anthropic', // 'anthropic' | 'openai' | 'gemini' (vedi aiProviders.js)
    endpoint: 'https://api.anthropic.com/v1/messages',
    apiKey: '',
    model: 'claude-sonnet-4-6',
    prompt: 'Descrivi brevemente cosa vedi in questa immagine.',
  },
  telegram: {
    botToken: '',
    chatId: '',
  },
  remote: {
    triggerKeyCode: 'VOLUME_UP', // tasto emulato dal telecomando BT
  },
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          // Retro-compatibilità: impostazioni salvate da una versione
          // precedente dell'app non hanno ancora ai.provider (introdotto
          // per la selezione multi-provider). Lo deduciamo dall'endpoint
          // già salvato, così l'utente non si ritrova improvvisamente con
          // un provider sbagliato/vuoto senza aver cambiato nulla.
          if (parsed.ai && !parsed.ai.provider) {
            parsed.ai.provider = guessProviderFromEndpoint(parsed.ai.endpoint);
          }
          // Merge per sezione (non solo superficiale): se la versione salvata
          // non ha ancora un campo introdotto dopo (es. pen.ip), quel campo
          // resta al valore di default invece di sparire insieme alla
          // sezione intera.
          setSettings((prev) => ({
            ...prev,
            ...parsed,
            pen: { ...prev.pen, ...(parsed.pen || {}) },
            ai: { ...prev.ai, ...(parsed.ai || {}) },
            telegram: { ...prev.telegram, ...(parsed.telegram || {}) },
            remote: { ...prev.remote, ...(parsed.remote || {}) },
          }));
        }
      } catch (e) {
        console.warn('Errore caricamento impostazioni', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const updateSettings = useCallback(async (partial) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        ...partial,
        pen: { ...prev.pen, ...(partial.pen || {}) },
        ai: { ...prev.ai, ...(partial.ai || {}) },
        telegram: { ...prev.telegram, ...(partial.telegram || {}) },
        remote: { ...prev.remote, ...(partial.remote || {}) },
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((e) =>
        console.warn('Errore salvataggio impostazioni', e)
      );
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, loaded }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings deve essere usato dentro SettingsProvider');
  return ctx;
}
