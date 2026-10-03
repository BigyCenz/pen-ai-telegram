// Impostazioni raggruppate in quattro sezioni comprimibili (Penna,
// Telecomando, AI, Telegram). Ogni sezione mostra in testata un riassunto e
// se è completa. Il pulsante Salva compare in basso solo se ci sono
// modifiche non salvate.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../store/SettingsContext';
import Card from '../components/Card';
import Button from '../components/Button';
import IconBadge from '../components/IconBadge';
import ScreenHeader from '../components/ScreenHeader';
import Segmented from '../components/Segmented';
import ConfigField from '../components/ConfigField';
import { colors, spacing, typography, radius, tint } from '../theme';
import { SHELLY_EVENTS, SHELLY_ACTIONS, normalizeMac, isValidMac } from '../services/shellyConstants';
import {
  learnShellyButton,
  batteryOptimizationIgnored,
  openBatteryOptimizationRequest,
} from '../services/shellyRemoteListener';
import { usePenConnection } from '../store/PenConnectionContext';
import { validateSettings } from '../services/settingsValidation';
import { AI_PROVIDERS, getProviderById } from '../services/aiProviders';
import { fetchAvailableModels } from '../services/aiService';
import { withMobileNetwork } from '../services/wifiManager';

const EVENT_ICONS = {
  single: 'radio-button-on',
  double: 'copy-outline',
  triple: 'layers-outline',
  long: 'timer-outline',
  hold: 'hand-left-outline',
};

// Confronto strutturale, indipendente dall'ordine delle chiavi.
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

// Sezione comprimibile con icona, riassunto e stato.
function Section({ icon, color, title, summary, status, open, onToggle, children }) {
  return (
    <Card style={styles.section}>
      <TouchableOpacity style={styles.sectionHead} onPress={onToggle} activeOpacity={0.7}>
        <IconBadge name={icon} color={color} size={40} />
        <View style={{ flex: 1, marginLeft: spacing(1.5) }}>
          <Text style={typography.sectionTitle}>{title}</Text>
          <Text style={[typography.caption, { marginTop: 2 }]} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        {status === 'ok' && <Ionicons name="checkmark-circle" size={20} color={colors.success} style={{ marginRight: 6 }} />}
        {status === 'todo' && <Ionicons name="alert-circle" size={20} color={colors.warning} style={{ marginRight: 6 }} />}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textDim} />
      </TouchableOpacity>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </Card>
  );
}

export default function SettingsScreen() {
  const { settings, updateSettings } = useSettings();
  const { pushLog } = usePenConnection();
  const [local, setLocal] = useState(settings);
  const [openId, setOpenId] = useState('remote');

  // Telecomando Shelly: stato della procedura "impara pulsante".
  const [learning, setLearning] = useState(false);
  const [learnMsg, setLearnMsg] = useState(null); // { tone: 'info' | 'ok' | 'error', text }
  const [batteryOk, setBatteryOk] = useState(() => batteryOptimizationIgnored());

  const [availableModels, setAvailableModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState(null);

  useEffect(() => setLocal(settings), [settings]);

  const dirty = useMemo(() => !deepEqual(local, settings), [local, settings]);

  // Chiavi/token incollati da un messaggio o da una pagina web spesso si
  // portano dietro uno spazio o un a-capo finale: finirebbero negli header
  // HTTP e farebbero rifiutare la richiesta come "chiave non valida" senza
  // che l'utente capisca perché. Vengono ripuliti al salvataggio.
  const [saved, setSaved] = useState(false);
  const save = () => {
    const clean = {
      ...local,
      pen: { ...local.pen, ssidPrefix: local.pen.ssidPrefix.trim(), ip: local.pen.ip.trim() },
      ai: {
        ...local.ai,
        endpoint: local.ai.endpoint.trim(),
        apiKey: local.ai.apiKey.trim(),
        model: (local.ai.model || '').trim(),
      },
      telegram: { botToken: local.telegram.botToken.trim(), chatId: local.telegram.chatId.trim() },
      remote: {
        ...local.remote,
        shelly: { ...local.remote.shelly, mac: normalizeMac(local.remote.shelly.mac) },
      },
    };
    setLocal(clean);
    updateSettings(clean);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const setShelly = (patch) =>
    setLocal((s) => ({ ...s, remote: { ...s.remote, shelly: { ...s.remote.shelly, ...patch } } }));

  const learnButton = async () => {
    setLearning(true);
    setLearnMsg({ tone: 'info', text: 'In ascolto: premi una volta il pulsante Shelly, vicino al telefono (30 secondi).' });
    try {
      const mac = await learnShellyButton({ onLog: (m) => pushLog(`[Shelly] ${m}`) });
      setShelly({ mac });
      setLearnMsg({ tone: 'ok', text: `Pulsante rilevato: ${mac}. Premi Salva per confermare.` });
      pushLog(`[Shelly] pulsante imparato: ${mac}`);
    } catch (e) {
      setLearnMsg({ tone: 'error', text: e.message });
    } finally {
      setLearning(false);
    }
  };

  const currentProvider = getProviderById(local.ai.provider);

  // Cambiare provider aggiorna SUBITO endpoint e modello ai default di
  // quel provider (restano modificabili a mano) e svuota la lista modelli
  // già recuperata, che appartiene al provider precedente.
  const selectProvider = (providerId) => {
    const provider = getProviderById(providerId);
    setLocal((s) => ({
      ...s,
      ai: { ...s.ai, provider: providerId, endpoint: provider.defaultEndpoint, model: provider.defaultModel },
    }));
    setAvailableModels([]);
    setModelsError(null);
  };

  // Come per le altre chiamate esterne (vedi automationPipeline.js): se il
  // telefono è ancora sul WiFi della penna, la richiesta al provider AI
  // deve passare dai dati mobili, quindi va avvolta in withMobileNetwork().
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

  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id));

  const macOk = isValidMac(local.remote.shelly.mac);
  const aiOk = !!local.ai.apiKey.trim() && !!(local.ai.model || '').trim();
  const tgOk = !!local.telegram.botToken.trim() && !!local.telegram.chatId.trim();
  const { valid, problems } = validateSettings(local);

  const toneColor = { info: colors.primary, ok: colors.success, error: colors.danger };
  const toneIcon = { info: 'radio-outline', ok: 'checkmark-circle', error: 'alert-circle' };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, (dirty || saved) && { paddingBottom: spacing(14) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader title="Impostazioni" subtitle="Tutto è personalizzabile, nulla è fisso nel codice" />

        <View
          style={[
            styles.banner,
            { backgroundColor: valid ? colors.successSoft : colors.warningSoft },
          ]}
        >
          <Ionicons
            name={valid ? 'checkmark-circle' : 'warning'}
            size={20}
            color={valid ? colors.success : colors.warning}
          />
          <Text style={[styles.bannerText, { color: valid ? colors.success : colors.warning }]}>
            {valid ? 'Configurazione completa' : problems.join(' · ')}
          </Text>
        </View>

        {/* PENNA */}
        <Section
          icon="hardware-chip-outline"
          color={colors.accentWifi}
          title="Penna"
          summary={`${local.pen.ssidPrefix || 'Nax_'} · ${local.pen.ip || '192.168.169.1'}`}
          status="ok"
          open={openId === 'pen'}
          onToggle={() => toggle('pen')}
        >
          <ConfigField
            label="Prefisso SSID"
            hint="Vuoto = Nax_"
            value={local.pen.ssidPrefix}
            onChangeText={(v) => setLocal((s) => ({ ...s, pen: { ...s.pen, ssidPrefix: v } }))}
            placeholder="es. Nax_ oppure Care_"
          />
          <ConfigField
            label="IP penna"
            hint="Vuoto = 192.168.169.1"
            value={local.pen.ip}
            onChangeText={(v) => setLocal((s) => ({ ...s, pen: { ...s.pen, ip: v } }))}
            placeholder="192.168.169.1"
          />
        </Section>

        {/* TELECOMANDO */}
        <Section
          icon="bluetooth"
          color={colors.accentBle}
          title="Telecomando Shelly"
          summary={macOk ? `Pulsante ${normalizeMac(local.remote.shelly.mac)}` : 'Pulsante da imparare'}
          status={macOk ? 'ok' : 'todo'}
          open={openId === 'remote'}
          onToggle={() => toggle('remote')}
        >
          <Text style={typography.label}>PULSANTE</Text>
          <View style={styles.macRow}>
            <Ionicons name="radio-outline" size={18} color={macOk ? colors.accentBle : colors.textFaint} />
            <Text style={[styles.macText, !macOk && { color: colors.textFaint }]}>
              {macOk ? normalizeMac(local.remote.shelly.mac) : 'non ancora imparato'}
            </Text>
          </View>
          <Button
            label={learning ? 'In ascolto…' : 'Impara pulsante'}
            icon="scan"
            variant="tonal"
            onPress={learnButton}
            loading={learning}
          />
          {learnMsg ? (
            <View style={[styles.learnMsg, { backgroundColor: tint(toneColor[learnMsg.tone], 0.12) }]}>
              <Ionicons name={toneIcon[learnMsg.tone]} size={18} color={toneColor[learnMsg.tone]} />
              <Text style={styles.learnMsgText}>{learnMsg.text}</Text>
            </View>
          ) : null}

          <View style={{ height: spacing(2) }} />
          <ConfigField
            label="Oppure inserisci il MAC a mano"
            value={local.remote.shelly.mac}
            onChangeText={(v) => setShelly({ mac: v })}
            placeholder="AA:BB:CC:DD:EE:FF"
          />

          <Text style={[typography.label, { marginBottom: spacing(0.5) }]}>COSA FA OGNI PRESSIONE</Text>
          {SHELLY_EVENTS.map((ev) => (
            <View key={ev.id} style={styles.eventRow}>
              <View style={styles.eventHead}>
                <Ionicons name={EVENT_ICONS[ev.id] || 'ellipse-outline'} size={16} color={colors.textDim} />
                <Text style={styles.eventLabel}>{ev.label}</Text>
              </View>
              <Segmented
                options={SHELLY_ACTIONS}
                value={local.remote.shelly.actions[ev.id]}
                onChange={(id) => setShelly({ actions: { ...local.remote.shelly.actions, [ev.id]: id } })}
              />
            </View>
          ))}

          <View style={styles.note}>
            <Ionicons name="information-circle" size={18} color={colors.textDim} />
            <Text style={styles.noteText}>
              L'ascolto parte quando la sessione con la penna è attiva e continua a schermo spento (notifica fissa).
              Ogni evento ricevuto finisce nel Log.
            </Text>
          </View>

          {batteryOk ? (
            <View style={[styles.learnMsg, { backgroundColor: colors.successSoft }]}>
              <Ionicons name="battery-charging" size={18} color={colors.success} />
              <Text style={styles.learnMsgText}>Ottimizzazione batteria già esclusa: l'app resta attiva a schermo spento.</Text>
            </View>
          ) : (
            <Button
              label="Escludi l'app dall'ottimizzazione batteria"
              icon="battery-charging"
              variant="secondary"
              onPress={() => {
                openBatteryOptimizationRequest();
                setTimeout(() => setBatteryOk(batteryOptimizationIgnored()), 4000);
              }}
            />
          )}
        </Section>

        {/* AI */}
        <Section
          icon="sparkles"
          color={colors.accentAi}
          title="Intelligenza artificiale"
          summary={`${currentProvider.label} · ${local.ai.model || 'nessun modello'}`}
          status={aiOk ? 'ok' : 'todo'}
          open={openId === 'ai'}
          onToggle={() => toggle('ai')}
        >
          <Text style={[typography.label, { marginBottom: 8 }]}>PROVIDER</Text>
          <Segmented
            options={AI_PROVIDERS.map((p) => ({ id: p.id, label: p.label }))}
            value={local.ai.provider}
            onChange={selectProvider}
          />
          <View style={{ height: spacing(2) }} />

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
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={local.ai.model}
              onValueChange={(v) => setLocal((s) => ({ ...s, ai: { ...s.ai, model: v } }))}
              style={styles.picker}
              dropdownIconColor={colors.text}
              itemStyle={styles.pickerItem}
            >
              {/* Finché non si è recuperato l'elenco dal provider, l'unica
                  opzione è quella già salvata (o il default del provider). */}
              {availableModels.length === 0 && (
                <Picker.Item
                  label={local.ai.model || currentProvider.defaultModel}
                  value={local.ai.model || currentProvider.defaultModel}
                />
              )}
              {!availableModels.some((m) => m.id === local.ai.model) &&
                local.ai.model &&
                availableModels.length > 0 && (
                  <Picker.Item label={`${local.ai.model} (attuale, non nell'elenco)`} value={local.ai.model} />
                )}
              {availableModels.map((m) => (
                <Picker.Item key={m.id} label={m.label} value={m.id} />
              ))}
            </Picker>
          </View>
          <Button
            label={availableModels.length > 0 ? 'Aggiorna elenco modelli' : 'Recupera modelli disponibili'}
            icon="refresh"
            variant="secondary"
            compact
            onPress={loadModels}
            loading={modelsLoading}
            disabled={!local.ai.apiKey}
            style={{ marginTop: spacing(1) }}
          />
          {!local.ai.apiKey && (
            <Text style={[typography.caption, { marginTop: 6 }]}>Inserisci la chiave API per recuperare i modelli.</Text>
          )}
          {modelsError && <Text style={[typography.caption, { color: colors.warning, marginTop: 6 }]}>{modelsError}</Text>}

          <View style={{ height: spacing(2) }} />
          <ConfigField
            label="Prompt"
            value={local.ai.prompt}
            onChangeText={(v) => setLocal((s) => ({ ...s, ai: { ...s.ai, prompt: v } }))}
            multiline
          />
        </Section>

        {/* TELEGRAM */}
        <Section
          icon="paper-plane"
          color={colors.accentTelegram}
          title="Telegram"
          summary={tgOk ? `Chat ${local.telegram.chatId}` : 'Da configurare'}
          status={tgOk ? 'ok' : 'todo'}
          open={openId === 'telegram'}
          onToggle={() => toggle('telegram')}
        >
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
        </Section>
      </ScrollView>

      {/* BARRA SALVA: solo con modifiche non salvate (o per un attimo dopo il salvataggio) */}
      {dirty || saved ? (
        <View style={styles.saveBar}>
          {saved && !dirty ? (
            <View style={styles.savedRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.savedText}>Impostazioni salvate</Text>
            </View>
          ) : (
            <>
              <View style={{ flex: 1 }}>
                <Text style={styles.dirtyTitle}>Modifiche non salvate</Text>
              </View>
              <Button label="Annulla" variant="ghost" compact onPress={() => setLocal(settings)} />
              <Button label="Salva" icon="save-outline" compact onPress={save} style={{ marginLeft: 8, minWidth: 110 }} />
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(2.5), paddingBottom: spacing(5) },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: spacing(2),
  },
  bannerText: { flex: 1, marginLeft: 8, fontSize: 13, fontWeight: '600', lineHeight: 18 },

  section: { padding: 0, overflow: 'hidden' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', padding: spacing(2) },
  sectionBody: {
    paddingHorizontal: spacing(2),
    paddingBottom: spacing(2),
    paddingTop: spacing(2),
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },

  macRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginTop: 6,
    marginBottom: spacing(1.5),
  },
  macText: { ...typography.mono, fontSize: 14, marginLeft: 8 },

  learnMsg: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: radius.md,
    padding: spacing(1.5),
    marginTop: spacing(1.5),
  },
  learnMsgText: { color: colors.text, fontSize: 13, lineHeight: 19, marginLeft: 8, flex: 1 },

  eventRow: { marginTop: spacing(1.5) },
  eventHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  eventLabel: { color: colors.text, fontSize: 14, fontWeight: '600', marginLeft: 8 },

  note: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: spacing(2) },
  noteText: { color: colors.textDim, fontSize: 12.5, lineHeight: 18, marginLeft: 8, flex: 1 },

  pickerWrap: {
    marginTop: 6,
    backgroundColor: colors.bg,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    // Su iOS il Picker è una wheel e ha bisogno di altezza propria;
    // su Android è un dropdown compatto e questa altezza viene ignorata.
    ...(Platform.OS === 'ios' ? { height: 160 } : null),
  },
  picker: { color: colors.text },
  pickerItem: { color: colors.text, fontSize: 15 },

  saveBar: {
    position: 'absolute',
    left: spacing(2),
    right: spacing(2),
    bottom: spacing(1.5),
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing(1),
    paddingHorizontal: spacing(2),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  dirtyTitle: { color: colors.text, fontWeight: '700', fontSize: 14 },
  savedRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  savedText: { color: colors.success, fontWeight: '700', fontSize: 14, marginLeft: 8 },
});
