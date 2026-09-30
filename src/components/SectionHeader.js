import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { typography, spacing } from '../theme';

export default function SectionHeader({ title, subtitle, right }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={typography.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={[typography.caption, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(1.5),
  },
});
