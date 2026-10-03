import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import IconBadge from './IconBadge';
import { colors, radius, spacing } from '../theme';

// Riquadro compatto "icona + etichetta + valore", pensato per stare in griglia a 2 colonne.
export default function StatTile({ icon, color, label, value, children }) {
  return (
    <View style={styles.tile}>
      <IconBadge name={icon} color={color} size={34} />
      <Text style={styles.label}>{label}</Text>
      {children || (
        <Text style={styles.value} numberOfLines={1}>
          {value ?? '—'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing(1.5),
    marginBottom: spacing(1.5),
  },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '600', marginTop: spacing(1) },
  value: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
});
