// Tab bar orizzontale minimale, senza dipendenze da icon set esterni (per
// non introdurre package non presenti in package.json): le "icone" sono
// semplici glifi unicode monospaced, leggeri e sempre disponibili.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../theme';

const TABS = [
  { key: 'Home', label: 'Penna', glyph: '◎' },
  { key: 'Capture', label: 'Cattura', glyph: '◉' },
  { key: 'Log', label: 'Log', glyph: '≡' },
  { key: 'Settings', label: 'Impostazioni', glyph: '⚙' },
];

export default function BottomTabBar({ activeKey, onSelect }) {
  return (
    <View style={styles.wrap}>
      {TABS.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.item}
            onPress={() => onSelect(tab.key)}
            activeOpacity={0.7}
          >
            <View style={[styles.glyphWrap, active && styles.glyphWrapActive]}>
              <Text style={[styles.glyph, active && styles.glyphActive]}>{tab.glyph}</Text>
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: spacing(1),
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glyphWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphWrapActive: { backgroundColor: colors.primaryDim },
  glyph: { fontSize: 17, color: colors.textDim },
  glyphActive: { color: colors.primary },
  label: { fontSize: 11, color: colors.textDim, marginTop: 3, fontWeight: '600' },
  labelActive: { color: colors.primary },
});
