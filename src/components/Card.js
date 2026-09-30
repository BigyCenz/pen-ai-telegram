import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, spacing, shadow } from '../theme';

export default function Card({ children, style, elevated = true }) {
  return <View style={[styles.card, elevated && shadow, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2.5),
    marginBottom: spacing(2),
  },
});
