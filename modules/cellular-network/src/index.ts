import CellularNetworkModule from './CellularNetworkModule';

// Richiede esplicitamente la rete dati mobile e binda il processo a quella
// rete specifica (non solo "sciogliere" il binding sul WiFi, come fa
// bindProcessToNetwork(null) da solo — vedi commento in
// CellularNetworkModule.kt sul perché questo è necessario).
export function requestCellular(timeoutMs?: number): Promise<void> {
  return CellularNetworkModule.requestCellular(timeoutMs);
}

// Rilascia il binding sulla rete cellulare.
export function releaseCellular(): void {
  CellularNetworkModule.releaseCellular();
}
