// Non applicabile sul web: sul web non esiste il concetto di WiFi "senza
// internet" forzato a livello di processo che questo modulo risolve su
// Android. Le funzioni sono no-op per non rompere import condizionali su
// piattaforme diverse da Android (il progetto attuale è Android-only, ma
// Metro risolve comunque il file .web.ts se mai servisse in futuro).
export default {
  async requestCellular(_timeoutMs?: number): Promise<void> {
    return undefined;
  },
  releaseCellular(): void {
    // no-op
  },
};
