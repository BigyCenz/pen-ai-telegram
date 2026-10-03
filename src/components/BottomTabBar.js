// Tab bar con icone vere (Ionicons): piena e colorata per la tab attiva, solo
// contorno per le altre; la tab attiva mostra anche una pillola di sfondo.
// Sull'icona "Penna" c'è un pallino di stato della connessione, così lo
// stato si vede da qualunque schermata.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { usePenConnection, PEN_STATUS } from '../store/PenConnectionContext';

const TABS = [
  { key: 'Home', label: 'Penna', icon: 'pulse-outline', iconActive: 'pulse' },
  { key: 'Capture', label: 'Scatta', icon: 'camera-outline', iconActive: 'camera' },
  { key: 'Log', label: 'Log', icon: 'list-outline', iconActive: 'list' },
  { key: 'Settings', label: 'Impostazioni', icon: 'settings-outline', iconActive: 'settings' },
];

export default function BottomTabBar({ activeKey, onSelect }) {
  // L'area sicura inferiore (barra di navigazione a gesti / tasti di
  // sistema) va aggiunta al padding, altrimenti la tab bar può finire
  // sotto i controlli di sistema sui telefoni con edge-to-edge.
  const insets = useSafeAreaInsets();
  const { penStatus } = usePenConnection();

  const dotColor =
    penStatus === PEN_STATUS.CONNECTED
      ? colors.success
      : penStatus === PEN_STATUS.CONNECTING
        ? colors.warning
        : penStatus === PEN_STATUS.ERROR
          ? colors.danger
          : null;

  return (
    <View style={[styles.wrap, { paddingBottom: 8 + insets.bottom }]}>
      {TABS.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <TouchableOpacity key={tab.key} style={styles.item} onPress={() => onSelect(tab.key)} activeOpacity={0.7}>
            <View style={[styles.pill, active && styles.pillActive]}>
              <Ionicons
                name={active ? tab.iconActive : tab.icon}
                size={22}
                color={active ? colors.primary : colors.textDim}
              />
              {tab.key === 'Home' && dotColor ? (
                <View style={[styles.dot, { backgroundColor: dotColor }]} />
              ) : null}
            </View>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {tab.label}
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
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.borderSoft,
    paddingTop: 10,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pill: {
    width: 58,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { backgroundColor: colors.primarySoft },
  dot: {
    position: 'absolute',
    top: 3,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  label: { fontSize: 11, color: colors.textDim, marginTop: 3, fontWeight: '600' },
  labelActive: { color: colors.primary, fontWeight: '700' },
});
