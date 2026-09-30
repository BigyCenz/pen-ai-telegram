import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSettings } from '../store/SettingsContext';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { colors, spacing, typography, radius } from '../theme';
import {
  ensurePermissions,
  scanPenNetworks,
  connectToPen,
  disconnectFromPen,
  DEFAULT_PEN_IP,
} from '../services/wifiManager';
import { NaxclowClient } from '../services/naxclowClient';
import { startRemoteListener, stopRemoteListener } from '../services/bluetoothRemoteListener';
import { runCaptureToTelegramFlow } from '../services/automationPipeline';
import { validateSettings } from '../services/settingsValidation';

export default function HomeScreen({ navigation }) {
  const { settings } = useSettings();
  const [connState, setConnState] = useState('idle'); // idle | connecting | connected | error
  const [networks, setNetworks] = useState([]);
  const [manualSsid, setManualSsid] = useState('Nax_22C160004AFB');
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [lastImage, setLastImage] = useState(null);
  const [lastAiText, setLastAiText] = useState(null);
  const [liveFrameUri, setLiveFrameUri] = useState(null);
  const [liveOn, setLiveOn] = useState(false);

  const clientRef = useRef(null);

  const pushLog = useCallback((msg) => {
    setLog((prev) => [...prev.slice(-40), `${new Date().toLocaleTimeString()}  ${msg}`]);
  }, []);

  const [scanPermIssue, setScanPermIssue] = useState(null);

  const handleScan = async () => {
    setScanPermIssue(null);
    const perm = await ensurePermissions();
    if (!perm.ok) {
      pushLog(perm.reason || 'Permessi WiFi non concessi');
      if (perm.openSettings) setScanPermIssue(perm);
      return;
    }
    pushLog('Scansione reti WiFi...');
    try {
      const list = await scanPenNetworks(settings.pen.ssidPrefix);
      setNetworks(list);
      pushLog(`Trovate ${list.length} reti compatibili`);
    } catch (e) {
      pushLog(`Scansione fallita: ${e.message}. Puoi comunque connetterti inserendo il nome della rete a mano qui sotto.`);
    }
  };

  const doConnect = async (ssid, password = null) => {
    try {
      setConnState('connecting');
      pushLog(`Connessione WiFi a ${ssid}...`);
      await connectToPen(ssid, password);

      const client = new NaxclowClient({ deviceIp: settings.pen.ip || DEFAULT_PEN_IP, ssid });
      pushLog(`Apertura connessione TCP a ${settings.pen.ip || DEFAULT_PEN_IP}:6123...`);
      await client.connect();

      pushLog('Login sulla penna...');
      await client.login();

      client.startLiveView();
      clientRef.current = client;

      setConnState('connected');
      pushLog('Connesso e autenticato.');

      startRemoteListener(settings.remote.triggerKeyCode, handleTrigger);
      pushLog('Telecomando BT in ascolto.');

      client.startLivePreview((frameBuffer) => {
        setLiveFrameUri(`data:image/jpeg;base64,${frameBuffer.toString('base64')}`);
      });
      setLiveOn(true);
    } catch (e) {
      setConnState('error');
      pushLog(`Errore connessione: ${e.message}`);
    }
  };

  const handleDisconnect = async () => {
    stopRemoteListener();
    if (clientRef.current) clientRef.current.close();
    setLiveOn(false);
    setLiveFrameUri(null);
    await disconnectFromPen();
    setConnState('idle');
    pushLog('Disconnesso.');
  };

  const handleTrigger = useCallback(async () => {
    if (busy || !clientRef.current) return;

    const { valid, problems } = validateSettings(settings);
    if (!valid) {
      pushLog(`Impostazioni incomplete: ${problems.join(', ')}`);
      return;
    }

    setBusy(true);
    clientRef.current.stopLivePreview();
    try {
      const result = await runCaptureToTelegramFlow({
        naxclowClient: clientRef.current,
        settings,
        onStatus: pushLog,
      });
      setLastImage(result.imagePath);
      setLastAiText(result.aiText);
    } catch (e) {
      // già loggato dentro la pipeline
    } finally {
      setBusy(false);
      if (clientRef.current && liveOn) {
        clientRef.current.startLivePreview((frameBuffer) => {
          setLiveFrameUri(`data:image/jpeg;base64,${frameBuffer.toString('base64')}`);
        });
      }
    }
  }, [busy, settings, pushLog, liveOn]);

  useEffect(() => {
    return () => {
      stopRemoteListener();
      if (clientRef.current) clientRef.current.close();
    };
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <LinearGradient
        colors={[colors.primary, colors.primaryDim]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Pen AI → Telegram</Text>
        <Text style={styles.headerSubtitle}>Scatto dalla penna · analisi AI · invio automatico</Text>
      </LinearGradient>

      <Card>
        <StatusBadge variant={connState} />
        <View style={{ height: spacing(2) }} />

        {connState !== 'connected' ? (
          <>
            <Text style={typography.label}>CONNETTI ALLA PENNA</Text>
            <View style={{ height: 8 }} />
            <TextInput
              style={styles.ssidInput}
              value={manualSsid}
              onChangeText={setManualSsid}
              placeholder="Nome rete penna (SSID)"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: spacing(1.5) }]}
              onPress={() => doConnect(manualSsid)}
            >
              <Text style={styles.primaryBtnText}>Connetti a "{manualSsid}"</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={handleScan}>
              <Text style={styles.secondaryBtnText}>oppure cerca reti disponibili</Text>
            </TouchableOpacity>
            {scanPermIssue && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={scanPermIssue.openSettings}>
                <Text style={[styles.secondaryBtnText, { color: colors.warning }]}>
                  Permesso bloccato · apri impostazioni app
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <TouchableOpacity style={styles.dangerBtn} onPress={handleDisconnect}>
            <Text style={styles.primaryBtnText}>Disconnetti</Text>
          </TouchableOpacity>
        )}
      </Card>

      {networks.length > 0 && connState !== 'connected' && (
        <Card>
          <Text style={typography.label}>RETI TROVATE</Text>
          {networks.map((n) => (
            <TouchableOpacity
              key={n.BSSID || n.SSID}
              style={styles.networkRow}
              onPress={() => doConnect(n.SSID)}
            >
              <Text style={typography.body}>{n.SSID}</Text>
              <Text style={typography.subtitle}>Connetti →</Text>
            </TouchableOpacity>
          ))}
        </Card>
      )}

      {connState === 'connected' && (
        <Card>
          <View style={styles.liveHeaderRow}>
            <Text style={typography.label}>ANTEPRIMA LIVE</Text>
            {liveOn && (
              <View style={styles.liveDotRow}>
                <View style={styles.liveDot} />
                <Text style={styles.liveDotText}>LIVE</Text>
              </View>
            )}
          </View>
          <View style={{ height: spacing(1) }} />
          <View style={styles.liveBox}>
            {liveFrameUri ? (
              <Image source={{ uri: liveFrameUri }} style={styles.liveImage} resizeMode="cover" />
            ) : (
              <ActivityIndicator color={colors.primary} />
            )}
          </View>
        </Card>
      )}

      {connState === 'connected' && (
        <Card>
          <Text style={typography.label}>SCATTO MANUALE (TEST)</Text>
          <View style={{ height: spacing(1) }} />
          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            onPress={handleTrigger}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Scatta e invia ora</Text>
            )}
          </TouchableOpacity>
          <Text style={[typography.subtitle, { marginTop: spacing(1) }]}>
            In uso normale, lo scatto parte dal telecomando Bluetooth
          </Text>
        </Card>
      )}

      {lastImage && (
        <Card>
          <Text style={typography.label}>ULTIMO SCATTO INVIATO</Text>
          <Image source={{ uri: `file://${lastImage}` }} style={styles.preview} />
          {lastAiText && <Text style={[typography.body, { marginTop: spacing(1) }]}>{lastAiText}</Text>}
        </Card>
      )}

      <Card>
        <Text style={typography.label}>LOG</Text>
        <View style={{ height: spacing(1) }} />
        {log.length === 0 && <Text style={typography.subtitle}>Nessun evento ancora</Text>}
        {log.map((l, i) => (
          <Text key={i} style={typography.mono}>{l}</Text>
        ))}
      </Card>

      <TouchableOpacity style={styles.settingsLink} onPress={() => navigation.navigate('Settings')}>
        <Text style={{ color: colors.primary, fontWeight: '600' }}>Impostazioni →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(2.5), paddingBottom: spacing(6) },
  header: {
    borderRadius: radius.lg,
    padding: spacing(3),
    marginBottom: spacing(2),
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  secondaryBtnText: { color: colors.textDim, fontSize: 13, textDecorationLine: 'underline' },
  dangerBtn: {
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  ssidInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
  },
  networkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  liveHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveDotRow: { flexDirection: 'row', alignItems: 'center' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger, marginRight: 5 },
  liveDotText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  liveBox: {
    height: 240,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  liveImage: { width: '100%', height: '100%' },
  preview: { width: '100%', height: 220, borderRadius: radius.md, marginTop: spacing(1) },
  settingsLink: { alignItems: 'center', marginTop: spacing(2) },
});
