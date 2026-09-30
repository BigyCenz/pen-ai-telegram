// Schermata "Log": tutto l'output diagnostico (WiFi, sessione penna,
// pipeline AI/Telegram) tenuto separato dalla Home per non affollarla,
// utile soprattutto durante il debug del protocollo/hardware.
import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '../theme';
import { usePenConnection } from '../store/PenConnectionContext';

export default function LogScreen() {
  const { log, clearLog } = usePenConnection();

  const data = [...log].reverse();

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <Text style={typography.title}>Log</Text>
        <TouchableOpacity onPress={clearLog} style={styles.clearBtn}>
          <Text style={styles.clearBtnText}>Svuota</Text>
        </TouchableOpacity>
      </View>

      {data.length === 0 ? (
        <View style={styles.empty}>
          <Text style={typography.subtitle}>Nessun evento registrato ancora.</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, idx) => `${item.t}-${idx}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.time}>{new Date(item.t).toLocaleTimeString()}</Text>
              <Text style={styles.msg}>{item.msg}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2) },
  clearBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  clearBtnText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: spacing(6) },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  time: { ...typography.mono, color: colors.textDim, width: 78 },
  msg: { ...typography.mono, flex: 1, flexWrap: 'wrap' },
});
