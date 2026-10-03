// Schermata "Scatta": due azioni volutamente separate.
//   1) Il pulsante di scatto fa SOLO la foto e la mostra subito, senza
//      aspettare nessuna chiamata di rete verso AI/Telegram.
//   2) "Analizza e invia" (compare dopo uno scatto) manda quella foto già
//      visualizzata alla pipeline AI -> Telegram, su azione volontaria.
// In uso automatico (telecomando) le due cose restano unite in sequenza,
// gestito nel Context, non in questa schermata.
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import Button from '../components/Button';
import IconBadge from '../components/IconBadge';
import ScreenHeader from '../components/ScreenHeader';
import StatusBadge from '../components/StatusBadge';
import { colors, spacing, typography, radius } from '../theme';
import { usePenConnection, PEN_STATUS } from '../store/PenConnectionContext';

export default function CaptureScreen({ navigation }) {
  const { penStatus, capture, captureBusy, captureError, sendLastCapture, sendBusy, sendError, lastCapture } =
    usePenConnection();

  const connected = penStatus === PEN_STATUS.CONNECTED;
  const reconnecting = penStatus === PEN_STATUS.CONNECTING;
  const alreadySent = !!lastCapture?.aiText;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader
        title="Scatta"
        subtitle="Scatta, controlla la foto, poi invia quando vuoi"
        right={
          <StatusBadge
            variant={connected ? 'connected' : reconnecting ? 'connecting' : 'idle'}
            text={connected ? 'Penna pronta' : reconnecting ? 'Riconnessione' : 'Non connessa'}
          />
        }
      />

      {!connected ? (
        <Card>
          <View style={styles.empty}>
            <IconBadge name={reconnecting ? 'sync' : 'unlink'} color={reconnecting ? colors.primary : colors.textDim} size={56} round />
            <Text style={[typography.sectionTitle, { marginTop: spacing(2) }]}>
              {reconnecting ? 'Riconnessione in corso' : 'Penna non connessa'}
            </Text>
            <Text style={[typography.subtitle, { textAlign: 'center', marginTop: 4, marginBottom: spacing(2) }]}>
              {reconnecting
                ? 'Appena la penna torna disponibile potrai scattare.'
                : 'Completa la connessione nella sezione Penna.'}
            </Text>
            {!reconnecting && (
              <Button label="Vai a Penna" icon="pulse" variant="tonal" onPress={() => navigation.navigate('Home')} />
            )}
          </View>
        </Card>
      ) : (
        <Card style={styles.shutterCard}>
          <TouchableOpacity
            style={styles.shutterRing}
            onPress={capture}
            disabled={captureBusy}
            activeOpacity={0.8}
          >
            <View style={[styles.shutter, captureBusy && styles.shutterBusy]}>
              {captureBusy ? (
                <ActivityIndicator color={colors.primary} size="large" />
              ) : (
                <Ionicons name="camera" size={34} color="#0B0D12" />
              )}
            </View>
          </TouchableOpacity>
          <Text style={[typography.subtitle, { marginTop: spacing(2), textAlign: 'center' }]}>
            {captureBusy ? 'Scatto in corso…' : 'Tocca per scattare · solo foto, nessun invio'}
          </Text>
          {captureError && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.errorText}>{captureError}</Text>
            </View>
          )}
        </Card>
      )}

      {lastCapture && (
        <Card>
          <View style={styles.previewWrap}>
            <Image source={{ uri: `file://${lastCapture.imagePath}` }} style={styles.preview} />
            <View style={styles.timeChip}>
              <Ionicons name="time-outline" size={12} color={colors.text} />
              <Text style={styles.timeChipText}>{new Date(lastCapture.capturedAt).toLocaleTimeString()}</Text>
            </View>
            {alreadySent && (
              <View style={[styles.timeChip, styles.sentChip]}>
                <Ionicons name="checkmark-circle" size={12} color="#04201A" />
                <Text style={[styles.timeChipText, { color: '#04201A' }]}>Inviata</Text>
              </View>
            )}
          </View>

          <Button
            label={alreadySent ? 'Già inviata a Telegram' : 'Analizza con AI e invia'}
            icon={alreadySent ? 'checkmark' : 'paper-plane'}
            variant={alreadySent ? 'secondary' : 'success'}
            onPress={sendLastCapture}
            loading={sendBusy}
            disabled={alreadySent}
            style={{ marginTop: spacing(2) }}
          />

          {lastCapture.aiText && (
            <View style={styles.aiBox}>
              <View style={styles.aiHead}>
                <Ionicons name="sparkles" size={16} color={colors.accentAi} />
                <Text style={[typography.label, { marginLeft: 6, color: colors.accentAi }]}>RISPOSTA AI</Text>
              </View>
              <Text style={[typography.body, { marginTop: 8 }]}>{lastCapture.aiText}</Text>
            </View>
          )}
          {sendError && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.errorText}>{sendError}</Text>
            </View>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(2.5), paddingBottom: spacing(5) },
  empty: { alignItems: 'center', paddingVertical: spacing(2) },

  shutterCard: { alignItems: 'center', paddingVertical: spacing(4) },
  shutterRing: {
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 3,
    borderColor: colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterBusy: { backgroundColor: colors.primarySoft },

  previewWrap: { borderRadius: radius.md, overflow: 'hidden' },
  preview: { width: '100%', height: 280, backgroundColor: colors.bg },
  timeChip: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(11,13,18,0.75)',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
  },
  sentChip: { left: undefined, right: 10, backgroundColor: colors.success },
  timeChipText: { color: colors.text, fontSize: 11, fontWeight: '700', marginLeft: 4 },

  aiBox: {
    marginTop: spacing(2),
    padding: spacing(2),
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
  },
  aiHead: { flexDirection: 'row', alignItems: 'center' },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing(1.5),
    marginTop: spacing(1.5),
    alignSelf: 'stretch',
  },
  errorText: { color: colors.text, fontSize: 13, lineHeight: 19, marginLeft: 8, flex: 1 },
});
