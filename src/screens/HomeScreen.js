// Schermata "Penna": cruscotto di connessione.
//   - In alto una scheda di stato che si legge a colpo d'occhio (penna
//     connessa / in connessione / offline, batteria, rete, telecomando).
//   - Sotto, finché non si è connessi, i due passi in ordine: 1) rete WiFi
//     della penna, 2) sessione applicativa (discovery + login).
//   - A connessione avvenuta i passi spariscono e restano i dati del
//     dispositivo in riquadri, con le azioni rapide.
// Lo scatto vive nella tab "Scatta", il dettaglio diagnostico nel "Log".
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import Button from '../components/Button';
import IconBadge from '../components/IconBadge';
import StatTile from '../components/StatTile';
import BatteryIndicator from '../components/BatteryIndicator';
import { colors, spacing, typography, radius, gradients, tint } from '../theme';
import { usePenConnection, WIFI_STATUS, PEN_STATUS } from '../store/PenConnectionContext';
import { useSettings } from '../store/SettingsContext';
import { isValidMac } from '../services/shellyConstants';

// Piccola "pillola" informativa con icona, usata nella scheda di stato.
function Pill({ icon, color = colors.textDim, children }) {
  return (
    <View style={[styles.pill, { backgroundColor: tint(color, 0.14) }]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

// Un passo della procedura: cerchio numerato (o spunta se completato) + titolo.
function StepHeader({ n, done, active, title, subtitle }) {
  return (
    <View style={styles.stepHeader}>
      <View
        style={[
          styles.stepCircle,
          done && { backgroundColor: colors.success, borderColor: colors.success },
          active && !done && { borderColor: colors.primary },
        ]}
      >
        {done ? (
          <Ionicons name="checkmark" size={16} color="#04201A" />
        ) : (
          <Text style={[styles.stepNum, active && { color: colors.primary }]}>{n}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={typography.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={[typography.caption, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

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
    sessionDesired,
    connectPenSession,
    disconnectPenSession,
  } = usePenConnection();
  const { settings } = useSettings();

  const [networks, setNetworks] = useState([]);
  const [scanning, setScanning] = useState(false);

  // Con la tab bar in uso ogni schermata viene rimontata a ogni cambio
  // tab, quindi un semplice effetto al mount basta per aggiornare lo
  // stato WiFi ogni volta che l'utente torna su questa sezione.
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

  const onPenWifi = wifiStatus === WIFI_STATUS.PEN_NETWORK;
  const connected = penStatus === PEN_STATUS.CONNECTED;
  const connecting = penStatus === PEN_STATUS.CONNECTING;
  const failed = penStatus === PEN_STATUS.ERROR;
  const macOk = isValidMac(settings.remote.shelly.mac);

  const hero = connected
    ? { grad: gradients.heroConnected, icon: 'checkmark-circle', color: colors.success, title: 'Penna connessa' }
    : connecting
      ? { grad: gradients.hero, icon: 'sync', color: colors.primary, title: sessionDesired ? 'Riconnessione…' : 'Connessione…' }
      : failed
        ? { grad: gradients.heroError, icon: 'alert-circle', color: colors.danger, title: 'Connessione non riuscita' }
        : { grad: gradients.hero, icon: 'power', color: colors.textDim, title: 'Penna non connessa' };

  const heroSubtitle = connected
    ? penInfo?.devName || penInfo?.devId || 'Sessione attiva'
    : connecting
      ? penError || 'Un attimo, sto contattando la penna'
      : failed
        ? penError
        : onPenWifi
          ? 'WiFi pronto: avvia la sessione'
          : 'Collegati prima al WiFi della penna';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* SCHEDA DI STATO */}
      <LinearGradient colors={hero.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={[styles.heroIcon, { backgroundColor: tint(hero.color, 0.16), borderColor: tint(hero.color, 0.4) }]}>
            {connecting ? (
              <ActivityIndicator color={hero.color} />
            ) : (
              <Ionicons name={hero.icon} size={30} color={hero.color} />
            )}
          </View>
          <View style={{ flex: 1, marginLeft: spacing(2) }}>
            <Text style={styles.heroTitle}>{hero.title}</Text>
            <Text style={styles.heroSubtitle} numberOfLines={2}>
              {heroSubtitle}
            </Text>
          </View>
        </View>

        <View style={styles.pills}>
          {connected && penInfo?.battery != null ? (
            <View style={[styles.pill, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
              <BatteryIndicator level={penInfo.battery} size={16} textStyle={{ fontSize: 12 }} />
            </View>
          ) : null}
          <Pill icon={onPenWifi ? 'wifi' : 'wifi-outline'} color={onPenWifi ? colors.accentWifi : colors.textDim}>
            {onPenWifi ? currentSsid || 'Rete penna' : 'WiFi penna assente'}
          </Pill>
          <Pill
            icon="bluetooth"
            color={sessionDesired && macOk ? colors.accentBle : macOk ? colors.textDim : colors.warning}
          >
            {!macOk ? 'Telecomando da imparare' : sessionDesired ? 'Telecomando attivo' : 'Telecomando in pausa'}
          </Pill>
        </View>
      </LinearGradient>

      {connected ? (
        <>
          {/* DATI DISPOSITIVO */}
          <View style={styles.sectionLabelRow}>
            <Text style={typography.label}>DISPOSITIVO</Text>
          </View>
          <View style={styles.grid}>
            <StatTile icon="battery-full" color={colors.success} label="Batteria">
              <BatteryIndicator level={penInfo?.battery} size={20} textStyle={{ fontSize: 16 }} />
            </StatTile>
            <StatTile icon="cube-outline" color={colors.primary} label="Modello" value={penInfo?.devModel} />
            <StatTile icon="code-slash-outline" color={colors.accentAi} label="Firmware" value={penInfo?.firmwareVersion} />
            <StatTile icon="wifi-outline" color={colors.accentWifi} label="WiFi penna" value={penInfo?.wifiName} />
          </View>
          <Card elevated={false} style={{ paddingVertical: spacing(1.5) }}>
            <View style={styles.idRow}>
              <IconBadge name="finger-print" color={colors.textDim} size={34} />
              <View style={{ marginLeft: spacing(1.5), flex: 1 }}>
                <Text style={typography.caption}>Device ID</Text>
                <Text style={styles.idValue} numberOfLines={1}>
                  {penInfo?.devId || '—'}
                </Text>
              </View>
            </View>
          </Card>

          <Button
            label="Vai a Scatta"
            icon="camera"
            onPress={() => navigation.navigate('Capture')}
            style={{ marginBottom: spacing(1.5) }}
          />
          <Button label="Termina sessione" icon="power" variant="danger" onPress={disconnectPenSession} />
        </>
      ) : (
        <>
          {/* PASSO 1 · WIFI */}
          <Card>
            <StepHeader
              n={1}
              done={onPenWifi}
              active={!onPenWifi}
              title="Rete WiFi della penna"
              subtitle={onPenWifi ? currentSsid : 'La penna crea una rete propria: il telefono deve associarsi'}
            />

            {!onPenWifi && permissionIssue && (
              <View style={styles.warnBox}>
                <View style={styles.warnHead}>
                  <Ionicons name="warning" size={18} color={colors.warning} />
                  <Text style={styles.warnTitle}>Serve un tuo intervento</Text>
                </View>
                <Text style={styles.warnText}>{permissionIssue.reason}</Text>
                <Button
                  label={permissionIssue.actionLabel || 'Apri impostazioni'}
                  variant="warning"
                  onPress={permissionIssue.openSettings}
                  compact
                />
                <Button
                  label="Ho sistemato · riprova"
                  variant="ghost"
                  onPress={refreshWifiStatus}
                  compact
                  style={{ marginTop: 4 }}
                />
              </View>
            )}

            {!onPenWifi && !permissionIssue && (
              <>
                <Text style={[typography.subtitle, { marginBottom: spacing(1.5) }]}>
                  Cerca una rete che inizia con "{ssidPrefix}" (il prefisso si cambia nelle Impostazioni).
                </Text>
                <Button label="Cerca reti della penna" icon="search-outline" onPress={handleScan} loading={scanning} />

                {networks.length > 0 && (
                  <View style={{ marginTop: spacing(1.5) }}>
                    {networks.map((n) => (
                      <TouchableOpacity
                        key={n.BSSID || n.SSID}
                        style={styles.networkRow}
                        onPress={() => joinPenNetwork(n.SSID)}
                        disabled={wifiBusy}
                        activeOpacity={0.7}
                      >
                        <IconBadge name="wifi" color={colors.accentWifi} size={34} />
                        <Text style={[typography.body, { flex: 1, marginLeft: spacing(1.5) }]}>{n.SSID}</Text>
                        {wifiBusy ? (
                          <ActivityIndicator color={colors.primary} />
                        ) : (
                          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Button
                  label="Già connesso dalle impostazioni · aggiorna"
                  variant="ghost"
                  icon="refresh"
                  onPress={refreshWifiStatus}
                  compact
                  style={{ marginTop: spacing(1) }}
                />
              </>
            )}
          </Card>

          {/* PASSO 2 · SESSIONE */}
          <Card style={!onPenWifi && styles.dimmed}>
            <StepHeader
              n={2}
              done={false}
              active={onPenWifi}
              title="Sessione con la penna"
              subtitle="Login e lettura dati dal dispositivo"
            />
            {!onPenWifi ? (
              <Text style={typography.subtitle}>Completa prima il passo 1.</Text>
            ) : (
              <>
                <Button
                  label={connecting ? 'Connessione…' : 'Connetti alla penna'}
                  icon="link"
                  onPress={connectPenSession}
                  loading={connecting}
                />
                {penError && !connecting ? (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle" size={18} color={colors.danger} />
                    <Text style={styles.errorText}>{penError}</Text>
                  </View>
                ) : null}
              </>
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(2.5), paddingBottom: spacing(5) },

  hero: {
    borderRadius: radius.xl,
    padding: spacing(2.5),
    marginBottom: spacing(2.5),
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  heroSubtitle: { fontSize: 13, color: colors.textDim, marginTop: 3, lineHeight: 18 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing(2), marginRight: -6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    marginRight: 6,
    marginBottom: 6,
    maxWidth: '100%',
  },
  pillText: { fontSize: 12, fontWeight: '700', marginLeft: 5 },

  sectionLabelRow: { marginBottom: spacing(1), marginLeft: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  idRow: { flexDirection: 'row', alignItems: 'center' },
  idValue: { ...typography.mono, fontSize: 14, marginTop: 2 },

  stepHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing(2) },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(1.5),
  },
  stepNum: { color: colors.textDim, fontWeight: '800', fontSize: 13 },
  dimmed: { opacity: 0.6 },

  networkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },

  warnBox: {
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    borderRadius: radius.md,
    padding: spacing(2),
  },
  warnHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  warnTitle: { color: colors.warning, fontWeight: '700', fontSize: 14, marginLeft: 8 },
  warnText: { color: colors.text, fontSize: 14, lineHeight: 20, marginBottom: spacing(1.5) },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing(1.5),
    marginTop: spacing(1.5),
  },
  errorText: { color: colors.text, fontSize: 13, lineHeight: 19, marginLeft: 8, flex: 1 },
});
