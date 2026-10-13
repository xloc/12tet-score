import { computed, onScopeDispose, ref } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import {
  bluetoothMidiCharacteristic,
  bluetoothMidiService,
  decodeBluetoothMidi,
  type BluetoothCharacteristic,
  type BluetoothDevice,
} from '../bluetooth-midi';

type MidiInput = {
  name: MIDIPort['name'];
  state: MIDIPort['state'];
  transport: 'midi' | 'bluetooth';
  pressed: Record<number, Set<number>>;
};

type BluetoothSession = {
  device?: BluetoothDevice;
  characteristic?: BluetoothCharacteristic;
  id?: string;
  scan?: AbortController;
  receive: () => void;
  disconnected: () => void;
};

const bluetoothDeviceKey = 'bluetooth-midi-device';

function rememberBluetooth(id: string | null) {
  try {
    if (id) globalThis.localStorage?.setItem(bluetoothDeviceKey, id);
    else globalThis.localStorage?.removeItem(bluetoothDeviceKey);
  } catch {
    // Storage may be disabled; the live connection can still be used.
  }
}

export const useMidiStore = defineStore('midi', () => {
  const unavailable = ref(
    globalThis.isSecureContext === false
      ? 'MIDI requires HTTPS or localhost.'
      : typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function'
        ? 'Web MIDI is unavailable in this browser. Use desktop Chrome or Edge.'
        : '',
  );
  const connecting = ref(false);
  const ready = ref(false);
  const error = ref('');
  const bluetoothUnavailable = ref(
    globalThis.isSecureContext === false
      ? 'Bluetooth MIDI requires HTTPS or localhost.'
      : typeof navigator === 'undefined' || !navigator.bluetooth
        ? 'Web Bluetooth is unavailable in this browser. Use Chrome or Edge on a supported device.'
        : '',
  );
  const bluetoothConnecting = ref(false);
  const bluetoothReady = ref(false);
  const bluetoothError = ref('');
  const bluetoothRestoreUnavailable = ref(
    !bluetoothUnavailable.value && typeof navigator.bluetooth?.getDevices !== 'function'
      ? 'This browser requires selecting the Bluetooth keyboard again after a page refresh.'
      : '',
  );
  const inputs = ref<Record<string, MidiInput>>({});
  const connectedCount = computed(
    () => Object.values(inputs.value).filter((input) => input.state === 'connected').length,
  );
  const pressedPitches = computed(() =>
    [
      ...new Set(
        Object.values(inputs.value).flatMap((input) =>
          Object.values(input.pressed).flatMap((pitches) => [...pitches]),
        ),
      ),
    ].sort((a, b) => a - b),
  );
  let access: MIDIAccess | undefined;
  let bluetooth: BluetoothSession | undefined;
  let disposed = false;
  const noteListeners = new Set<(pitch: number) => void>();

  function onNoteOn(listener: (pitch: number) => void) {
    noteListeners.add(listener);
    return () => noteListeners.delete(listener);
  }

  function updateInput(port: MIDIPort | null) {
    if (port?.type !== 'input') return;
    const { name, state } = port;
    inputs.value[port.id] = {
      name,
      state,
      transport: 'midi',
      pressed: state === 'connected' ? (inputs.value[port.id]?.pressed ?? {}) : {},
    };
    const input = port as MIDIInput;
    if (state === 'disconnected') input.onmidimessage = null;
    else if (!input.onmidimessage) {
      input.onmidimessage = (event) => receiveMessage(port.id, event.data);
    }
  }

  function receiveMessage(id: string, data: Uint8Array | null) {
    if (!data || data.length < 3) return;
    const [status, pitch, velocity] = data;
    const command = status! & 0xf0;
    const channel = status! & 0x0f;
    const pressed = inputs.value[id]!.pressed;
    if (command === 0x90 && velocity! > 0) {
      (pressed[channel] ??= new Set()).add(pitch!);
      for (const listener of noteListeners) listener(pitch!);
    } else if (command === 0x80 || command === 0x90) {
      pressed[channel]?.delete(pitch!);
    } else if (command === 0xb0 && (pitch === 120 || pitch === 123)) {
      delete pressed[channel];
    }
  }

  async function connect() {
    if (unavailable.value || connecting.value || ready.value) return;
    connecting.value = true;
    error.value = '';
    try {
      const result = await navigator.requestMIDIAccess({ sysex: false });
      if (disposed) return;
      access = result;
      access.onstatechange = (event) => updateInput(event.port);
      access.inputs.forEach(updateInput);
      ready.value = true;
    } catch (cause) {
      error.value =
        cause instanceof Error && cause.name === 'NotAllowedError'
          ? 'MIDI permission denied. Allow MIDI access in your browser, then try again.'
          : cause instanceof Error
            ? cause.message
            : String(cause);
    } finally {
      connecting.value = false;
    }
  }

  function disconnect() {
    if (access) {
      access.onstatechange = null;
      access.inputs.forEach((input) => {
        input.onmidimessage = null;
        void input.close();
      });
      access = undefined;
    }
    for (const [id, input] of Object.entries(inputs.value)) {
      if (input.transport === 'midi') delete inputs.value[id];
    }
    ready.value = false;
    error.value = '';
  }

  function releaseBluetooth(session: BluetoothSession) {
    session.scan?.abort();
    session.device?.removeEventListener('gattserverdisconnected', session.disconnected);
    session.characteristic?.removeEventListener('characteristicvaluechanged', session.receive);
    if (session.id && inputs.value[session.id]) {
      inputs.value[session.id]!.state = 'disconnected';
      inputs.value[session.id]!.pressed = {};
    }
    if (bluetooth === session) {
      bluetooth = undefined;
      bluetoothReady.value = false;
      bluetoothConnecting.value = false;
    }
  }

  function closeBluetooth() {
    const previous = bluetooth;
    if (previous) {
      releaseBluetooth(previous);
      previous.device?.gatt?.disconnect();
    }
    for (const [id, input] of Object.entries(inputs.value)) {
      if (input.transport === 'bluetooth') delete inputs.value[id];
    }
    bluetoothError.value = '';
  }

  function disconnectBluetooth() {
    closeBluetooth();
    rememberBluetooth(null);
  }

  function connectBluetooth() {
    return connectBluetoothDevice(() =>
      navigator.bluetooth!.requestDevice({ filters: [{ services: [bluetoothMidiService] }] }),
    );
  }

  async function restoreBluetooth() {
    if (bluetoothUnavailable.value || !navigator.bluetooth?.getDevices) return;
    let id: string | null;
    try {
      id = globalThis.localStorage?.getItem(bluetoothDeviceKey) ?? null;
    } catch {
      return;
    }
    if (!id) return;
    await connectBluetoothDevice(async () => {
      const devices = await navigator.bluetooth!.getDevices!();
      return devices.find((device) => device.id === id);
    }, true);
  }

  async function connectBluetoothDevice(
    select: () => Promise<BluetoothDevice | undefined>,
    restoring = false,
  ) {
    if (bluetoothUnavailable.value || bluetoothConnecting.value || bluetoothReady.value || disposed)
      return;
    closeBluetooth();
    bluetoothConnecting.value = true;
    const session: BluetoothSession = {
      receive() {
        if (bluetooth !== session || !session.id || !session.characteristic?.value) return;
        for (const message of decodeBluetoothMidi(session.characteristic.value)) {
          receiveMessage(session.id, message);
        }
      },
      disconnected() {
        if (bluetooth === session) releaseBluetooth(session);
      },
    };
    bluetooth = session;
    try {
      const device = await select();
      if (bluetooth !== session) return;
      if (!device) {
        releaseBluetooth(session);
        bluetoothError.value = 'Bluetooth permission was not retained. Select your keyboard again.';
        return;
      }
      session.device = device;
      session.id = `bluetooth:${device.id}`;
      if (restoring && device.watchAdvertisements) {
        // Previously authorized devices may be powered off or out of range.
        const scan = (session.scan = new AbortController());
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () =>
              scan.abort(
                new Error('Bluetooth keyboard not found. Turn it on and try connecting again.'),
              ),
            10000,
          );
          const found = () => {
            resolve();
            scan.abort();
          };
          device.addEventListener('advertisementreceived', found, { once: true });
          scan.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timeout);
              device.removeEventListener('advertisementreceived', found);
              reject(scan.signal.reason);
            },
            { once: true },
          );
          void device.watchAdvertisements!({ signal: scan.signal }).catch((cause) =>
            scan.abort(cause),
          );
        });
        if (bluetooth !== session) return;
      }
      device.addEventListener('gattserverdisconnected', session.disconnected);
      const server = await device.gatt!.connect();
      if (bluetooth !== session) {
        device.gatt!.disconnect();
        return;
      }
      const service = await server.getPrimaryService(bluetoothMidiService);
      if (bluetooth !== session) return;
      const characteristic = await service.getCharacteristic(bluetoothMidiCharacteristic);
      if (bluetooth !== session) return;
      session.characteristic = characteristic;
      // The initial read performs the BLE-MIDI connection/pairing handshake.
      if (characteristic.properties.read) await characteristic.readValue();
      if (bluetooth !== session) return;
      inputs.value[session.id] = {
        name: device.name ?? null,
        state: 'disconnected',
        transport: 'bluetooth',
        pressed: {},
      };
      characteristic.addEventListener('characteristicvaluechanged', session.receive);
      await characteristic.startNotifications();
      if (bluetooth !== session) return;
      inputs.value[session.id]!.state = 'connected';
      bluetoothReady.value = true;
      rememberBluetooth(device.id);
    } catch (cause) {
      if (bluetooth !== session) return;
      closeBluetooth();
      if (!restoring && cause instanceof Error && cause.name === 'NotFoundError' && !session.device)
        return;
      bluetoothError.value =
        cause instanceof Error && cause.name === 'NotAllowedError'
          ? 'Bluetooth permission denied. Allow Bluetooth access in your browser and system settings, then try again.'
          : cause instanceof Error
            ? cause.message
            : String(cause);
    } finally {
      if (bluetooth === session) bluetoothConnecting.value = false;
    }
  }

  onScopeDispose(() => {
    disposed = true;
    noteListeners.clear();
    disconnect();
    closeBluetooth();
  });

  return {
    unavailable,
    connecting,
    ready,
    error,
    bluetoothUnavailable,
    bluetoothConnecting,
    bluetoothReady,
    bluetoothError,
    bluetoothRestoreUnavailable,
    inputs,
    connectedCount,
    pressedPitches,
    onNoteOn,
    connect,
    disconnect,
    connectBluetooth,
    restoreBluetooth,
    disconnectBluetooth,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMidiStore, import.meta.hot));
}
