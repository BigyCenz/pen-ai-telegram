import './src/polyfills';
import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SettingsProvider } from './src/store/SettingsContext';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

export default function App() {
  return (
    <SettingsProvider>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ headerShown: true, title: 'Impostazioni', headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SettingsProvider>
  );
}
