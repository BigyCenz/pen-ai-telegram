import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSettings } from '../store/SettingsContext';
import Card from '../components/Card';
import ConfigField from '../components/ConfigField';
import { colors, spacing, typography, radius } from '../theme';
import { AVAILABLE_TRIGGER_KEYS } from '../services/bluetoothRemoteListener';
import { validateSettings } from '../services/settingsValidation';

export default function SettingsScreen() {
  const { settings, updateSettings } = useSettings();
  const [local, setLocal] = useState(settings);

  useEffect(() => setLocal(settings), [settings]);

  const save = () => updateSettings(local);

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
        <Text style={typography.label}>AI</Text>
        <View style={{ height: spacing(1) }} />
        <ConfigField
          label="Endpoint API"
          value={local.ai.endpoint}
          onChangeText={(v) => setLocal((s) => ({ ...s, ai: { ...s.ai, endpoint: v } }))}
        />
        <ConfigField
          label="Modello"
          value={local.ai.model}
          onChangeText={(v) => setLocal((s) => ({ ...s, ai: { ...s.ai, model: v } }))}
        />
        <ConfigField
          label="Chiave API"
          value={local.ai.apiKey}
          onChangeText={(v) => setLocal((s) => ({ ...s, ai: { ...s.ai, apiKey: v } }))}
          secure
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
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing(1),
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
