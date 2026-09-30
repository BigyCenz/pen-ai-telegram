// Schermata "Cattura": un solo pulsante grande per scattare manualmente e
// vedere subito il risultato come prova (immagine + eventuale risposta AI).
// In uso normale lo scatto arriva dal telecomando Bluetooth (gestito nel
// Context, non qui), questo pulsante serve per test/verifica manuale.
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native';
import Card from '../components/Card';
import SectionHeader from '../components/SectionHeader';
import StatusBadge from '../components/StatusBadge';
import { colors, spacing, typography, radius } from '../theme';
import { usePenConnection, PEN_STATUS } from '../store/PenConnectionContext';

export default function CaptureScreen({ navigation }) {
  const { penStatus, capture, captureBusy, lastCapture } = usePenConnection();

  const connected = penStatus === PEN_STATUS.CONNECTED;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={typography.title}>Cattura</Text>
      <Text style={[typography.subtitle, { marginTop: 4, marginBottom: spacing(2) }]}>
        Scatto manuale di prova · in uso normale parte dal telecomando Bluetooth
      </Text>

      <Card>
        <SectionHeader
          title="Stato sessione"
          right={<StatusBadge variant={connected ? 'connected' : 'idle'} text={connected ? 'Penna pronta' : 'Non connessa'} />}
        />
        {!connected && (
          <>
            <Text style={[typography.subtitle, { marginBottom: spacing(1.5) }]}>
              Devi prima completare la connessione nella sezione Penna.
            </Text>
            <TouchableOpacity style={styles.secondaryFilledBtn} onPress={() => navigation.navigate('Home')}>
              <Text style={styles.primaryBtnText}>Vai a Penna →</Text>
            </TouchableOpacity>
          </>
        )}
      </Card>

      {connected && (
        <Card style={styles.captureCard}>
          <TouchableOpacity
            style={[styles.captureBtn, captureBusy && styles.captureBtnBusy]}
            onPress={capture}
            disabled={captureBusy}
            activeOpacity={0.8}
          >
            {captureBusy ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <View style={styles.captureBtnInner} />
            )}
          </TouchableOpacity>
          <Text style={[typography.subtitle, { marginTop: spacing(1.5), textAlign: 'center' }]}>
            {captureBusy ? 'Scatto in corso…' : 'Tocca per scattare e avviare la pipeline'}
          </Text>
        </Card>
      )}

      {lastCapture && (
        <Card>
          <SectionHeader title="Ultimo scatto" subtitle={new Date(lastCapture.capturedAt).toLocaleTimeString()} />
          <Image source={{ uri: `file://${lastCapture.imagePath}` }} style={styles.preview} />
          {lastCapture.aiText ? (
            <View style={styles.aiBox}>
              <Text style={typography.label}>RISPOSTA AI</Text>
              <Text style={[typography.body, { marginTop: 6 }]}>{lastCapture.aiText}</Text>
            </View>
          ) : (
            <Text style={[typography.subtitle, { marginTop: spacing(1) }]}>
              Foto salvata senza automazione (impostazioni AI/Telegram incomplete).
            </Text>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(2.5), paddingBottom: spacing(6) },
  secondaryFilledBtn: {
    backgroundColor: colors.primaryDim,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  captureCard: { alignItems: 'center', paddingVertical: spacing(4) },
  captureBtn: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.primaryDim,
  },
  captureBtnBusy: { backgroundColor: colors.primaryDim },
  captureBtnInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#fff',
  },
  preview: { width: '100%', height: 260, borderRadius: radius.md, marginTop: spacing(1) },
  aiBox: {
    marginTop: spacing(1.5),
    padding: spacing(1.5),
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
