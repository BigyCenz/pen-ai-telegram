import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, tint } from '../theme';

// Icona dentro un quadrato arrotondato con sfondo del suo stesso colore, tenue.
export default function IconBadge({ name, color = colors.primary, size = 40, iconSize, round }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: round ? size / 2 : radius.md - 2,
        backgroundColor: tint(color, 0.16),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={name} size={iconSize || Math.round(size * 0.52)} color={color} />
    </View>
  );
}
