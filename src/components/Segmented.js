import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

// Selettore a segmenti: una sola opzione attiva, tutte visibili insieme.
export default function Segmented({ options, value, onChange }) {
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <TouchableOpacity
            key={o.id}
            style={[styles.seg, active && styles.segActive]}
            onPress={() => onChange(o.id)}
            activeOpacity={0.8}
          >
            <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 3,
  },
  seg: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm - 1 },
  segActive: { backgroundColor: colors.primarySoft },
  text: { color: colors.textDim, fontSize: 12.5, fontWeight: '600' },
  textActive: { color: colors.primary, fontWeight: '700' },
});
