// Schermata "Penna": gestisce SOLO i due passi di connessione, in ordine,
// separati come richiesto:
//   1) Stato WiFi: sei sulla rete della penna? Se no, invita a connettersi
//      (senza nomi hardcoded: scansiona per prefisso o apre le impostazioni
//      di sistema).
//   2) Stato sessione penna: una volta sulla rete giusta, un pulsante avvia
//      la sessione applicativa (discovery + login) e mostra i dati letti
//      dal device.
// Lo scatto vero e proprio vive nella tab "Cattura", il log dettagliato
// nella tab "Log": qui restano solo un riepilogo di stato pensato per
// essere letto a colpo d'occhio.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Card from '../components/Card';
import SectionHeader from '../components/SectionHeader';
import InfoRow from '../components/InfoRow';
import StatusBadge from '../components/StatusBadge';
import { colors, spacing, typography, radius } from '../theme';
import { usePenConnection, WIFI_STATUS, PEN_STATUS } from '../store/PenConnectionContext';

export default function HomeScreen({ navigation }) {
  const {
    wifiStatus,
    currentSsid,
    wifiBusy,
    permissionIssue,
    ssidPrefix,
    refreshWifiStatus,
    scanForPenNetworks,
    joinPenNetwork,
    penStatus,
    penInfo,
    penError,
    connectPenSession,
    disconnectPenSession,
  } = usePenConnection();

  const [networks, setNetworks] = useState([]);
  const [scanning, setScanning] = useState(false);

  // Con la tab bar in uso ogni schermata viene rimontata a ogni cambio
  // tab (non resta "in pausa" come con uno Stack Navigator), quindi un
  // semplice effetto al mount basta per aggiornare lo stato WiFi ogni
  // volta che l'utente torna su questa sezione.
  useEffect(() => {
    refreshWifiStatus();
  }, [refreshWifiStatus]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const list = await scanForPenNetworks();
      setNetworks(list);
    } finally {
      setScanning(false);
    }
  };

  const onWifiCardConnected = wifiStatus === WIFI_STATUS.PEN_NETWORK;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <LinearGradient
        colors={[colors.primary, colors.primaryDim]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Pen AI → Telegram</Text>
        <Text style={styles.headerSubtitle}>Connessione alla penna, passo per passo</Text>
      </LinearGradient>

      {/* STEP 1: rete WiFi */}
      <Card>
        <SectionHeader
          title="1 · Rete WiFi"
          subtitle="La penna crea una rete propria a cui il telefono deve associarsi"
          right={
            <StatusBadge
              variant={onWifiCardConnected ? 'connected' : 'idle'}
              text={onWifiCardConnected ? 'Rete penna' : 'Non connesso'}
            />
          }
        />

        {currentSsid ? (
          <Text style={[typography.body, { marginBottom: spacing(1) }]}>
            Rete attuale: <Text style={{ fontWeight: '700' }}>{currentSsid}</Text>
          </Text>
        ) : !permissionIssue ? (
          <Text style={[typography.subtitle, { marginBottom: spacing(1) }]}>
            Nessuna rete WiFi rilevata.
          </Text>
        ) : null}

        {!onWifiCardConnected && permissionIssue && (
          <View style={styles.warnBox}>
            <Text style={styles.warnTitle}>Serve un tuo intervento</Text>
            <Text style={styles.warnText}>{permissionIssue.reason}</Text>
            <TouchableOpacity style={styles.warnBtn} onPress={permissionIssue.openSettings}>
              <Text style={styles.warnBtnText}>{permissionIssue.actionLabel || 'Apri impostazioni'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={refreshWifiStatus}>
              <Text style={styles.secondaryBtnText}>Ho sistemato · riprova</Text>
            </TouchableOpacity>
          </View>
        )}

        {!onWifiCardConnected && !permissionIssue && (
          <>
            <Text style={[typography.subtitle, { marginBottom: spacing(1.5) }]}>
              Connettiti a una rete che inizia con "{ssidPrefix}" (il prefisso è configurabile nelle Impostazioni).
            </Text>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleScan} disabled={scanning}>
              {scanning ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Cerca reti della penna</Text>
              )}
            </TouchableOpacity>

            {networks.length > 0 && (
              <View style={{ marginTop: spacing(1.5) }}>
                {networks.map((n) => (
                  <TouchableOpacity
                    key={n.BSSID || n.SSID}
                    style={styles.networkRow}
                    onPress={() => joinPenNetwork(n.SSID)}
                    disabled={wifiBusy}
                  >
                    <Text style={typography.body}>{n.SSID}</Text>
                    <Text style={typography.subtitle}>Connetti →</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.secondaryBtn} onPress={refreshWifiStatus}>
              <Text style={styles.secondaryBtnText}>Mi sono già connesso dalle impostazioni · aggiorna stato</Text>
            </TouchableOpacity>
          </>
        )}
      </Card>

      {/* STEP 2: sessione applicativa penna */}
      <Card>
        <SectionHeader
          title="2 · Sessione penna"
          subtitle="Login e lettura dati dal device"
          right={
            <StatusBadge
              variant={penStatus === PEN_STATUS.CONNECTED ? 'connected' : penStatus === PEN_STATUS.CONNECTING ? 'connecting' : penStatus === PEN_STATUS.ERROR ? 'error' : 'idle'}
            />
          }
        />

        {!onWifiCardConnected ? (
          <Text style={typography.subtitle}>Completa prima il passo 1: connettiti alla rete della penna.</Text>
        ) : penStatus === PEN_STATUS.CONNECTED ? (
          <>
            <InfoRow label="Modello" value={penInfo?.devModel} />
            <InfoRow label="Nome device" value={penInfo?.devName} />
            <InfoRow label="Device ID" value={penInfo?.devId} />
            <InfoRow label="Batteria" value={penInfo?.battery != null ? `${penInfo.battery}%` : null} />
            <InfoRow label="Firmware" value={penInfo?.firmwareVersion} />
            <InfoRow label="WiFi penna" value={penInfo?.wifiName} />

            <TouchableOpacity style={[styles.dangerBtn, { marginTop: spacing(2) }]} onPress={disconnectPenSession}>
              <Text style={styles.primaryBtnText}>Termina sessione</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.primaryBtn, penStatus === PEN_STATUS.CONNECTING && styles.btnDisabled]}
              onPress={connectPenSession}
              disabled={penStatus === PEN_STATUS.CONNECTING}
            >
              {penStatus === PEN_STATUS.CONNECTING ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Connetti alla penna</Text>
              )}
            </TouchableOpacity>
            {penError && <Text style={[typography.subtitle, { color: colors.danger, marginTop: spacing(1) }]}>{penError}</Text>}
          </>
        )}
      </Card>

      {penStatus === PEN_STATUS.CONNECTED && (
        <Card>
          <SectionHeader title="Pronto" subtitle="Vai alla sezione Cattura per scattare, o usa il telecomando Bluetooth" />
          <TouchableOpacity style={styles.secondaryFilledBtn} onPress={() => navigation.navigate('Capture')}>
            <Text style={styles.primaryBtnText}>Vai a Cattura →</Text>
          </TouchableOpacity>
        </Card>
      )}
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
  secondaryFilledBtn: {
    backgroundColor: colors.primaryDim,
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
  warnBox: {
    backgroundColor: 'rgba(251,191,36,0.10)',
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    padding: spacing(2),
  },
  warnTitle: { color: colors.warning, fontWeight: '700', fontSize: 14, marginBottom: 4 },
  warnText: { color: colors.text, fontSize: 14, lineHeight: 20, marginBottom: spacing(1.5) },
  warnBtn: {
    backgroundColor: colors.warning,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  warnBtnText: { color: '#1A1300', fontWeight: '700', fontSize: 14 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  networkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
