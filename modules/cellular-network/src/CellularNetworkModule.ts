// Import da 'expo-modules-core', non da 'expo': il progetto è su Expo
// SDK 51 (React Native 0.74), dove requireNativeModule() è esposto da
// expo-modules-core. L'export equivalente dal package 'expo' esiste solo
// in versioni più recenti dell'SDK (verificato sul template ufficiale
// expo-module-template@10.14.10, la versione dell'epoca di SDK 51).
import { requireNativeModule } from 'expo-modules-core';

interface CellularNetworkModuleInterface {
  // Richiede esplicitamente la rete cellulare (TRANSPORT_CELLULAR) e binda
  // il processo a quella rete specifica. Risolve quando il binding è
  // attivo; rigetta se la rete cellulare non diventa disponibile entro
  // timeoutMs (default 8000ms) — es. dati mobili spenti o assenza di
  // segnale — o se manca il permesso di sistema necessario.
  requestCellular(timeoutMs?: number): Promise<void>;

  // Rilascia il binding sulla rete cellulare, tornando al comportamento
  // di routing di default del sistema.
  releaseCellular(): void;
}

// Carica l'oggetto nativo del modulo dalla JSI.
export default requireNativeModule<CellularNetworkModuleInterface>('CellularNetwork');
