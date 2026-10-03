import React from 'react';
import { Text, TouchableOpacity, ActivityIndicator, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';

const VARIANTS = {
  primary: { bg: colors.primary, fg: '#0B0D12', border: 'transparent' },
  success: { bg: colors.success, fg: '#04201A', border: 'transparent' },
  secondary: { bg: colors.surfaceHigh, fg: colors.text, border: colors.border },
  tonal: { bg: colors.primarySoft, fg: colors.primary, border: 'transparent' },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: 'transparent' },
  warning: { bg: colors.warning, fg: '#1A1300', border: 'transparent' },
  ghost: { bg: 'transparent', fg: colors.textDim, border: 'transparent' },
};

export default function Button({ label, icon, onPress, variant = 'primary', loading, disabled, style, compact }) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const inactive = disabled || loading;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={inactive}
      style={[
        styles.btn,
        compact && styles.compact,
        { backgroundColor: v.bg, borderColor: v.border },
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={compact ? 16 : 18} color={v.fg} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.label, compact && styles.labelCompact, { color: v.fg }]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  compact: { paddingVertical: 9, minHeight: 38 },
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { fontWeight: '700', fontSize: 15 },
  labelCompact: { fontSize: 13 },
  inactive: { opacity: 0.5 },
});
