import './src/polyfills';
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SettingsProvider } from './src/store/SettingsContext';
import { PenConnectionProvider } from './src/store/PenConnectionContext';
import HomeScreen from './src/screens/HomeScreen';
import CaptureScreen from './src/screens/CaptureScreen';
import LogScreen from './src/screens/LogScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import BottomTabBar from './src/components/BottomTabBar';
import { colors } from './src/theme';

// Navigazione a tab semplice fatta in casa (senza react-navigation/bottom-
// tabs, non presente tra le dipendenze): ogni "schermata" riceve le stesse
// props di navigazione minime (navigate) usate in precedenza con lo Stack
// Navigator, così le screen restano compatibili senza modifiche ulteriori.
const SCREENS = {
  Home: HomeScreen,
  Capture: CaptureScreen,
  Log: LogScreen,
  Settings: SettingsScreen,
};

export default function App() {
  const [activeKey, setActiveKey] = useState('Home');

  const navigation = {
    navigate: (key) => setActiveKey(key),
  };

  const ActiveScreen = SCREENS[activeKey] || HomeScreen;

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <PenConnectionProvider>
          <SafeAreaView style={styles.root} edges={['top']}>
            <View style={styles.body}>
              <ActiveScreen navigation={navigation} />
            </View>
            <BottomTabBar activeKey={activeKey} onSelect={setActiveKey} />
          </SafeAreaView>
        </PenConnectionProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
});
