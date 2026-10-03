import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

// Icona + percentuale; il colore segue il livello.
export function batteryVisual(level) {
  const n = Number(level);
  if (!Number.isFinite(n)) return { icon: 'battery-half', color: colors.textFaint, text: '—' };
  if (n >= 60) return { icon: 'battery-full', color: colors.success, text: `${Math.round(n)}%` };
  if (n >= 30) return { icon: 'battery-half', color: colors.warning, text: `${Math.round(n)}%` };
  return { icon: 'battery-dead', color: colors.danger, text: `${Math.round(n)}%` };
}

export default function BatteryIndicator({ level, size = 18, showText = true, textStyle }) {
  const v = batteryVisual(level);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons name={v.icon} size={size} color={v.color} />
      {showText ? (
        <Text style={[{ color: v.color, fontWeight: '700', fontSize: 13, marginLeft: 5 }, textStyle]}>{v.text}</Text>
      ) : null}
    </View>
  );
}
