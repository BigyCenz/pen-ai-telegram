import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useSettings } from '../store/SettingsContext';
import Card from '../components/Card';
import ConfigField from '../components/ConfigField';
import { colors, spacing, typography, radius } from '../theme';
import { AVAILABLE_TRIGGER_KEYS } from '../services/bluetoothRemoteListener';
import { validateSettings } from '../services/settingsValidation';
import { AI_PROVIDERS, getProviderById } from '../services/aiProviders';
import { fetchAvailableModels } from '../services/aiService';
import { withMobileNetwork } from '../services/wifiManager';

export default function SettingsScreen() {
  const { settings, updateSettings } = useSettings();
  const [local, setLocal] = useState(settings);

  const [availableModels, setAvailableModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState(null);

  useEffect(() => setLocal(settings), [settings]);

  const save = () => updateSettings(local);

  const currentProvider = getProviderById(local.ai.provider);

  // Cambiare provider aggiorna SUBITO endpoint e modello ai default di
  // quel provider (l'utente può poi modificarli a mano se necessario:
  // resta un ConfigField editabile, non un valore fisso), e svuota la
  // lista modelli già fetchata (appartiene al provider precedente).
  const selectProvider = (providerId) => {
    const provider = getProviderById(providerId);
    setLocal((s) => ({
      ...s,
      ai: { ...s.ai, provider: providerId, endpoint: provider.defaultEndpoint, model: provider.defaultModel },
    }));
    setAvailableModels([]);
    setModelsError(null);
  };

  // Come per analyzeImageWithAI/sendPhotoToTelegram (vedi automationPipeline.js):
  // se il telefono è ancora connesso al WiFi della penna, quella rete è
  // forzata come rotta per TUTTO il processo (bindProcessToNetwork) e non
  // ha internet, quindi anche questa chiamata verso l'API del provider AI
  // fallirebbe con un generico errore di rete se non venisse avvolta in
  // withMobileNetwork(). Prima di questo fix questa era l'unica chiamata
  // di rete esterna dell'app rimasta SENZA questo wrapper.
  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const models = await withMobileNetwork(
        () => fetchAvailableModels({ provider: local.ai.provider, apiKey: local.ai.apiKey }),
        local.pen.ssidPrefix
      );
      setAvailableModels(models);
      if (models.length === 0) {
        setModelsError('Nessun modello compatibile trovato per questo account/chiave.');
      }
    } catch (e) {
      setModelsError(e.message);
    } finally {
      setModelsLoading(false);
    }
  }, [local.ai.provider, local.ai.apiKey, local.pen.ssidPrefix]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={typography.title}>Impostazioni</Text>
      <Text style={[typography.subtitle, { marginBottom: spacing(1) }]}>
        Tutto qui è personalizzabile, nulla è fisso nel codice
      </Text>
      {(() => {
        const { valid, problems } = validateSettings(local);
        return (
          <Text style={[typography.subtitle, { marginBottom: spacing(3), color: valid ? colors.success : colors.warning }]}>
            {valid ? 'Configurazione completa' : problems.join(' · ')}
          </Text>
        );
      })()}

      <Card>
        <Text style={typography.label}>PENNA / PROTOCOLLO</Text>
        <View style={{ height: spacing(1) }} />
        <ConfigField
          label="Prefisso SSID (opzionale)"
          value={local.pen.ssidPrefix}
          onChangeText={(v) => setLocal((s) => ({ ...s, pen: { ...s.pen, ssidPrefix: v } }))}
          placeholder="es. Nax_ oppure Care_"
        />
        <ConfigField
          label="IP penna (opzionale)"
          value={local.pen.ip}
          onChangeText={(v) => setLocal((s) => ({ ...s, pen: { ...s.pen, ip: v } }))}
          placeholder="default 192.168.169.1"
        />
      </Card>

      <Card>
        <Text style={typography.label}>TELECOMANDO BLUETOOTH</Text>
        <View style={{ height: spacing(1) }} />
        <Text style={typography.body}>Tasto trigger: {local.remote.triggerKeyCode}</Text>
        <View style={styles.chipRow}>
          {AVAILABLE_TRIGGER_KEYS.map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.chip, local.remote.triggerKeyCode === k && styles.chipActive]}
              onPress={() => setLocal((s) => ({ ...s, remote: { ...s.remote, triggerKeyCode: k } }))}
            >
              <Text style={styles.chipText}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      <Card>
        <Text style={typography.label}>AI · PROVIDER</Text>
        <View style={{ height: spacing(1) }} />
        <View style={styles.chipRow}>
          {AI_PROVIDERS.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.chip, local.ai.provider === p.id && styles.chipActive]}
              onPress={() => selectProvider(p.id)}
            >
              <Text style={styles.chipText}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ConfigField
          label="Endpoint API"
          value={local.ai.endpoint}
          onChangeText={(v) => setLocal((s) => ({ ...s, ai: { ...s.ai, endpoint: v } }))}
          placeholder={currentProvider.defaultEndpoint}
        />
        <ConfigField
          label="Chiave API"
          value={local.ai.apiKey}
          onChangeText={(v) => setLocal((s) => ({ ...s, ai: { ...s.ai, apiKey: v } }))}
          secure
        />

        <Text style={typography.label}>MODELLO</Text>
        <View style={{ height: 6 }} />
        <Text style={[typography.body, { marginBottom: spacing(1) }]}>
          Selezionato: <Text style={{ fontWeight: '700' }}>{local.ai.model || '(nessuno)'}</Text>
        </Text>

        <TouchableOpacity
          style={[styles.secondaryFilledBtn, (modelsLoading || !local.ai.apiKey) && styles.btnDisabled]}
          onPress={loadModels}
          disabled={modelsLoading || !local.ai.apiKey}
        >
          {modelsLoading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.secondaryFilledBtnText}>
              {availableModels.length > 0 ? 'Aggiorna elenco modelli' : 'Recupera modelli disponibili'}
            </Text>
          )}
        </TouchableOpacity>

        {!local.ai.apiKey && (
          <Text style={[typography.subtitle, { marginTop: spacing(1) }]}>
            Inserisci la chiave API sopra per poter recuperare i modelli disponibili per questo account.
          </Text>
        )}
        {modelsError && (
          <Text style={[typography.subtitle, { color: colors.warning, marginTop: spacing(1) }]}>{modelsError}</Text>
        )}

        {availableModels.length > 0 && (
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={
                // Se il modello salvato non è tra quelli fetchati (es.
                // configurato a mano prima, o provider appena cambiato),
                // il Picker su Android va comunque in errore se il value
                // non corrisponde a nessun Item: aggiungiamo quindi un
                // Item "attuale" fuori elenco quando serve (vedi sotto).
                local.ai.model
              }
              onValueChange={(v) => setLocal((s) => ({ ...s, ai: { ...s.ai, model: v } }))}
              style={styles.picker}
              dropdownIconColor={colors.text}
              itemStyle={styles.pickerItem}
            >
              {!availableModels.some((m) => m.id === local.ai.model) && local.ai.model && (
                <Picker.Item label={`${local.ai.model} (attuale, non nell'elenco)`} value={local.ai.model} />
              )}
              {availableModels.map((m) => (
                <Picker.Item key={m.id} label={m.label} value={m.id} />
              ))}
            </Picker>
          </View>
        )}

        <ConfigField
          label={availableModels.length > 0 ? 'Modello (oppure scrivilo qui a mano)' : 'Modello (manuale, oppure recupera l\'elenco sopra)'}
          value={local.ai.model}
          onChangeText={(v) => setLocal((s) => ({ ...s, ai: { ...s.ai, model: v } }))}
        />
        <ConfigField
          label="Prompt"
          value={local.ai.prompt}
          onChangeText={(v) => setLocal((s) => ({ ...s, ai: { ...s.ai, prompt: v } }))}
          multiline
        />
      </Card>

      <Card>
        <Text style={typography.label}>TELEGRAM</Text>
        <View style={{ height: spacing(1) }} />
        <ConfigField
          label="Bot Token"
          value={local.telegram.botToken}
          onChangeText={(v) => setLocal((s) => ({ ...s, telegram: { ...s.telegram, botToken: v } }))}
          secure
        />
        <ConfigField
          label="Chat ID"
          value={local.telegram.chatId}
          onChangeText={(v) => setLocal((s) => ({ ...s, telegram: { ...s.telegram, chatId: v } }))}
        />
      </Card>

      <TouchableOpacity style={styles.saveBtn} onPress={save}>
        <Text style={styles.saveBtnText}>Salva impostazioni</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(2.5), paddingBottom: spacing(6) },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing(1) },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { backgroundColor: colors.primaryDim, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  secondaryFilledBtn: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryFilledBtnText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  pickerWrap: {
    marginTop: spacing(1.5),
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    // Su iOS il Picker si comporta come una wheel view e ha bisogno di
    // altezza propria per essere leggibile; su Android è un dropdown
    // compatto e questa altezza fissa non serve (viene ignorata).
    ...(Platform.OS === 'ios' ? { height: 160 } : null),
  },
  picker: { color: colors.text },
  pickerItem: { color: colors.text, fontSize: 15 },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing(1),
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
