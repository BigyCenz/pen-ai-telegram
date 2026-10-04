import { EventEmitter, Subscription } from 'expo-modules-core';
import ShellyBleModule, { ShellyButtonEventName } from './ShellyBleModule';

export type { ShellyButtonEventName };

export interface ShellyButtonEvent {
  mac: string;
  event: ShellyButtonEventName;
  packetId: number; // -1 se il pacchetto non lo conteneva
  rssi: number;
}

const emitter = new EventEmitter(ShellyBleModule as any);

export function startRemote(mac: string | null, scan: boolean = true): void {
  ShellyBleModule.startRemote(mac, scan);
}

export function stopRemote(): void {
  ShellyBleModule.stopRemote();
}

export function isRunning(): boolean {
  return ShellyBleModule.isRunning();
}

export function isIgnoringBatteryOptimizations(): boolean {
  return ShellyBleModule.isIgnoringBatteryOptimizations();
}

export function requestIgnoreBatteryOptimizations(): void {
  ShellyBleModule.requestIgnoreBatteryOptimizations();
}

export function addButtonListener(listener: (e: ShellyButtonEvent) => void): Subscription {
  return emitter.addListener('onButtonEvent', listener);
}

// Battito nativo ogni secondo, attivo anche a schermo spento (i timer JS no).
export function addTickListener(listener: () => void): Subscription {
  return emitter.addListener('onTick', listener);
}

export function addLogListener(listener: (e: { message: string }) => void): Subscription {
  return emitter.addListener('onRemoteLog', listener);
}
