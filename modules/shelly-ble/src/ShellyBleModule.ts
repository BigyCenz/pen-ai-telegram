import { requireNativeModule } from 'expo-modules-core';

// Evento pulsante come lo emette il modulo nativo (vedi BtHomeParser.kt).
export type ShellyButtonEventName = 'single' | 'double' | 'triple' | 'long' | 'hold';

interface ShellyBleModuleInterface {
  // Avvia il servizio in primo piano con la scansione BLE filtrata BTHome.
  // mac = null → ascolta tutti i dispositivi BTHome (modalità "impara").
  // scan = false: solo servizio custode (lock + battito), nessuna scansione BLE.
  startRemote(mac: string | null, scan: boolean): void;
  stopRemote(): void;
  isRunning(): boolean;
  isIgnoringBatteryOptimizations(): boolean;
  // Apre la richiesta di sistema (l'utente deve confermare).
  requestIgnoreBatteryOptimizations(): void;
}

// Stesso pattern di modules/cellular-network: Expo SDK 51 → expo-modules-core.
export default requireNativeModule<ShellyBleModuleInterface>('ShellyBle');
