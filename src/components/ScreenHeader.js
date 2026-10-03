import React from 'react';
import { View, Text } from 'react-native';
import { typography, spacing } from '../theme';

export default function ScreenHeader({ title, subtitle, right }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing(2.5) }}>
      <View style={{ flex: 1 }}>
        <Text style={typography.title}>{title}</Text>
        {subtitle ? <Text style={[typography.subtitle, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}
