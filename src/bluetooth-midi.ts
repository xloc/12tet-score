export const bluetoothMidiService = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
export const bluetoothMidiCharacteristic = '7772e5db-3868-4112-a1a9-f2669d106bf3';

// Web Bluetooth isn't included in TypeScript's DOM declarations.
export type BluetoothCharacteristic = EventTarget & {
  properties: { read: boolean };
  value?: DataView;
  readValue(): Promise<DataView>;
  startNotifications(): Promise<BluetoothCharacteristic>;
};

export type BluetoothDevice = EventTarget & {
  id: string;
  name?: string;
  watchAdvertisements?(options: { signal: AbortSignal }): Promise<void>;
  gatt?: {
    connect(): Promise<{
      getPrimaryService(service: string): Promise<{
        getCharacteristic(characteristic: string): Promise<BluetoothCharacteristic>;
      }>;
    }>;
    disconnect(): void;
  };
};

export type Bluetooth = {
  getDevices?(): Promise<BluetoothDevice[]>;
  requestDevice(options: { filters: { services: string[] }[] }): Promise<BluetoothDevice>;
};

// Extract channel messages; timestamps and system messages don't affect held keys.
// BLE-MIDI 1.0 sections 7–8: running status ends at each packet boundary.
export function decodeBluetoothMidi(packet: DataView) {
  const messages: Uint8Array[] = [];
  if (packet.byteLength < 2 || (packet.getUint8(0) & 0xc0) !== 0x80) return messages;
  let offset = 1;
  let runningStatus = 0;
  let sysex = packet.getUint8(offset) < 0x80;

  while (offset < packet.byteLength) {
    // A timestamp precedes every status byte, and optionally a running-status message.
    if (packet.getUint8(offset) >= 0x80) offset++;
    if (offset === packet.byteLength) break;
    let status = packet.getUint8(offset);
    if (status >= 0x80) {
      offset++;
      if (status < 0xf0) runningStatus = status;
      if (status === 0xf0) sysex = true;
      if (status === 0xf7) sysex = false;
    } else if (sysex || !runningStatus) {
      offset++;
      continue;
    } else status = runningStatus;

    const length =
      status < 0xf0
        ? (status & 0xe0) === 0xc0
          ? 1
          : 2
        : status === 0xf2
          ? 2
          : status === 0xf1 || status === 0xf3
            ? 1
            : 0;
    if (offset + length > packet.byteLength) break;
    const message = new Uint8Array(length + 1);
    message[0] = status;
    for (let index = 0; index < length; index++) {
      const byte = packet.getUint8(offset++);
      if (byte >= 0x80) return messages;
      message[index + 1] = byte;
    }
    if (status < 0xf0) messages.push(message);
  }
  return messages;
}
