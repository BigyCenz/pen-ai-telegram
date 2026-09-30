import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

const VARIANTS = {
  idle: { bg: colors.surfaceAlt, dot: colors.textDim, label: 'In attesa' },
  connecting: { bg: colors.primaryDim, dot: colors.primary, label: 'Connessione...' },
  connected: { bg: '#153D2B', dot: colors.success, label: 'Connesso alla penna' },
  error: { bg: '#3D1616', dot: colors.danger, label: 'Errore' },
};

export default function StatusBadge({ variant = 'idle', text }) {
  const v = VARIANTS[variant] || VARIANTS.idle;
  return (
    <View style={[styles.badge, { backgroundColor: v.bg }]}>
      <View style={[styles.dot, { backgroundColor: v.dot }]} />
      <Text style={styles.text}>{text || v.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  text: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
