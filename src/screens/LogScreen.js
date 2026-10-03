// Schermata "Log": output diagnostico (WiFi, sessione penna, telecomando,
// pipeline AI/Telegram). Ogni riga ha un'icona colorata per tipo e si può
// filtrare, così gli errori non si perdono in mezzo al resto.
import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { colors, spacing, typography, radius, tint } from '../theme';
import { usePenConnection } from '../store/PenConnectionContext';

// Classifica una riga dal testo (il log è fatto di stringhe libere).
function classify(msg) {
  const m = msg || '';
  if (/errore|fallit|impossibile|timeout|persa|non avviat|negat|rifiutat|ignorata/i.test(m)) {
    return { kind: 'error', icon: 'alert-circle', color: colors.danger };
  }
  if (/^\[Shelly\]/i.test(m)) return { kind: 'remote', icon: 'bluetooth', color: colors.accentBle };
  if (/completato|attiva\.|riconnesso|salvato|identificata|connessa|connesso\./i.test(m)) {
    return { kind: 'ok', icon: 'checkmark-circle', color: colors.success };
  }
  return { kind: 'info', icon: 'information-circle', color: colors.textFaint };
}

const FILTERS = [
  { id: 'all', label: 'Tutti' },
  { id: 'error', label: 'Errori' },
  { id: 'remote', label: 'Telecomando' },
];

export default function LogScreen() {
  const { log, clearLog } = usePenConnection();
  const [filter, setFilter] = useState('all');

  const rows = useMemo(() => {
    const all = [...log].reverse().map((e) => ({ ...e, ...classify(e.msg) }));
    return filter === 'all' ? all : all.filter((r) => r.kind === filter);
  }, [log, filter]);

  const errorCount = useMemo(() => log.filter((e) => classify(e.msg).kind === 'error').length, [log]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Log"
        subtitle={`${log.length} eventi${errorCount ? ` · ${errorCount} errori` : ''}`}
        right={
          <TouchableOpacity onPress={clearLog} style={styles.clearBtn} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={16} color={colors.textDim} />
            <Text style={styles.clearBtnText}>Svuota</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const active = f.id === filter;
          return (
            <TouchableOpacity
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[styles.filter, active && styles.filterActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="list-outline" size={40} color={colors.textFaint} />
          <Text style={[typography.subtitle, { marginTop: spacing(1) }]}>
            {log.length === 0 ? 'Nessun evento registrato ancora.' : 'Nessun evento in questo filtro.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item, idx) => `${item.t}-${idx}`}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={[styles.row, item.kind === 'error' && { backgroundColor: tint(colors.danger, 0.07) }]}>
              <Ionicons name={item.icon} size={16} color={item.color} style={{ marginTop: 1 }} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.msg}>{item.msg}</Text>
                <Text style={styles.time}>{new Date(item.t).toLocaleTimeString()}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing(2.5), paddingBottom: 0 },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  clearBtnText: { color: colors.textDim, fontSize: 12, fontWeight: '700', marginLeft: 5 },
  filters: { flexDirection: 'row', marginBottom: spacing(1.5) },
  filter: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  filterActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  filterText: { color: colors.textDim, fontSize: 12.5, fontWeight: '600' },
  filterTextActive: { color: colors.primary, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: spacing(3) },
  row: {
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    borderRadius: radius.sm,
  },
  msg: { ...typography.mono, flexWrap: 'wrap', lineHeight: 18 },
  time: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
});
