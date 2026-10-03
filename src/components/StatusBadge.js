import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';

const VARIANTS = {
  idle: { bg: colors.surfaceHigh, fg: colors.textDim, icon: 'ellipse-outline', label: 'In attesa' },
  connecting: { bg: colors.primarySoft, fg: colors.primary, icon: 'sync', label: 'Connessione...' },
  connected: { bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle', label: 'Connesso' },
  error: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle', label: 'Errore' },
  warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'warning', label: 'Attenzione' },
};

export default function StatusBadge({ variant = 'idle', text }) {
  const v = VARIANTS[variant] || VARIANTS.idle;
  return (
    <View style={[styles.badge, { backgroundColor: v.bg }]}>
      <Ionicons name={v.icon} size={14} color={v.fg} />
      <Text style={[styles.text, { color: v.fg }]}>{text || v.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  text: { fontSize: 12, fontWeight: '700', marginLeft: 5 },
});
