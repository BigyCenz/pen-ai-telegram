import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme';

export default function ConfigField({ label, value, onChangeText, placeholder, secure, multiline, hint }) {
  const [focused, setFocused] = useState(false);
  // I campi segreti (chiavi, token) restano nascosti ma si possono mostrare per controllarli.
  const [reveal, setReveal] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={typography.label}>{label.toUpperCase()}</Text>
      <View style={[styles.inputWrap, focused && styles.inputFocused]}>
        <TextInput
          style={[styles.input, multiline && styles.multiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          secureTextEntry={secure && !reveal}
          multiline={multiline}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {secure ? (
          <TouchableOpacity onPress={() => setReveal((r) => !r)} style={styles.eye} hitSlop={8}>
            <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textDim} />
          </TouchableOpacity>
        ) : null}
      </View>
      {hint ? <Text style={[typography.caption, { marginTop: 4 }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing(2) },
  inputWrap: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputFocused: { borderColor: colors.primary },
  input: { flex: 1, paddingHorizontal: 12, paddingVertical: 11, color: colors.text, fontSize: 15 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  eye: { paddingHorizontal: 12 },
});
