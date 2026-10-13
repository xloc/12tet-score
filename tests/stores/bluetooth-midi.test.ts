import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { createPinia, type Pinia } from 'pinia';
import { bluetoothMidiCharacteristic, bluetoothMidiService } from '../../src/bluetooth-midi';
import { useMidiStore } from '../../src/stores/midi';
import { useFollowingStore } from '../../src/stores/following';
import { usePlaybackStore } from '../../src/stores/playback';
import { useScoreStore } from '../../src/stores/score';
import { practiceScore } from '../helpers/score';

class Characteristic extends EventTarget {
  properties = { read: true };
  value?: DataView;
  readValue = vi.fn().mockResolvedValue(new DataView(new ArrayBuffer(0)));
  startNotifications = vi.fn().mockResolvedValue(this);

  packet(bytes: number[]) {
    this.value = new DataView(Uint8Array.from(bytes).buffer);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}

class Device extends EventTarget {
  id = 'keyboard';
  name = 'Bluetooth keyboard';
  watchAdvertisements?: (options: { signal: AbortSignal }) => Promise<void>;
  characteristic = new Characteristic();
  service = { getCharacteristic: vi.fn().mockResolvedValue(this.characteristic) };
  getPrimaryService = vi.fn().mockResolvedValue(this.service);
  gatt = {
    connect: vi.fn().mockResolvedValue({ getPrimaryService: this.getPrimaryService }),
    disconnect: vi.fn(() => this.dispatchEvent(new Event('gattserverdisconnected'))),
  };
}

const requestDevice = vi.fn();
const getDevices = vi.fn();
const requestMIDIAccess = vi.fn();
let saved: Map<string, string>;
let device: Device;
let midi: ReturnType<typeof useMidiStore>;
let pinia: Pinia;

beforeEach(() => {
  requestDevice.mockReset();
  getDevices.mockReset();
  requestMIDIAccess.mockReset();
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { requestMIDIAccess, bluetooth: { requestDevice, getDevices } });
  saved = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  });
  device = new Device();
  requestDevice.mockResolvedValue(device);
  getDevices.mockResolvedValue([device]);
  pinia = createPinia();
  midi = useMidiStore(pinia);
});

afterEach(() => {
  midi.$dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('Bluetooth explicitly chooses a MIDI service, reads the handshake, and subscribes to notes', async () => {
  expect(requestDevice).not.toHaveBeenCalled();
  await midi.connectBluetooth();
  expect(requestDevice).toHaveBeenCalledExactlyOnceWith({
    filters: [{ services: [bluetoothMidiService] }],
  });
  expect(requestMIDIAccess).not.toHaveBeenCalled();
  expect(device.getPrimaryService).toHaveBeenCalledWith(bluetoothMidiService);
  expect(device.service.getCharacteristic).toHaveBeenCalledWith(bluetoothMidiCharacteristic);
  expect(device.characteristic.readValue).toHaveBeenCalledOnce();
  expect(device.characteristic.startNotifications).toHaveBeenCalledOnce();
  expect(midi.bluetoothReady).toBe(true);
  expect(midi.ready).toBe(false);
  expect(midi.connectedCount).toBe(1);
  device.characteristic.packet([0x80, 0x81, 0x90, 60, 100, 64, 100, 67, 100]);
  expect(midi.pressedPitches).toEqual([60, 64, 67]);
  device.characteristic.packet([0x80, 0x82, 0x90, 60, 0, 0x83, 0x80, 64, 0]);
  expect(midi.pressedPitches).toEqual([67]);
  device.characteristic.packet([0x80, 0x84, 0xb0, 123, 0]);
  expect(midi.pressedPitches).toEqual([]);
});

test('Bluetooth packets deliver every attack to the follower in order', async () => {
  const sheet = useScoreStore(pinia);
  sheet.load(practiceScore([[60], [60], [62], [64]], [[67], [69], [71], [72]]));
  const following = useFollowingStore(pinia);
  const playback = usePlaybackStore(pinia);
  try {
    await midi.connectBluetooth();
    device.characteristic.packet([0x80, 0x81, 0x90, 60, 100, 60, 100, 62, 100, 64, 100, 67, 100]);
    expect(following.recentPitches).toEqual([60, 60, 62, 64, 67]);
    expect(playback.currentTick).toBe(4);
    expect(following.result?.decision).toBe('advanced');
    device.characteristic.packet([0x80, 0x82, 0x80, 60, 0, 62, 0]);
    expect(following.recentPitches).toHaveLength(5);
    device.dispatchEvent(new Event('gattserverdisconnected'));
    expect(following.result).toBeNull();
  } finally {
    following.$dispose();
    playback.$dispose();
    sheet.$dispose();
  }
});

test('a pending chooser prevents duplicate requests and connected devices do not open another picker', async () => {
  let choose!: (value: Device) => void;
  requestDevice.mockImplementation(() => new Promise<Device>((resolve) => (choose = resolve)));
  const pending = midi.connectBluetooth();
  expect(midi.bluetoothConnecting).toBe(true);
  await midi.connectBluetooth();
  expect(requestDevice).toHaveBeenCalledOnce();
  choose(device);
  await pending;
  expect(midi.bluetoothConnecting).toBe(false);
  await midi.connectBluetooth();
  expect(requestDevice).toHaveBeenCalledOnce();
});

test('canceling the chooser is silent while denied Bluetooth permission explains how to retry', async () => {
  requestDevice.mockRejectedValueOnce(new DOMException('Canceled', 'NotFoundError'));
  await midi.connectBluetooth();
  expect(midi.bluetoothError).toBe('');
  expect(midi.bluetoothConnecting).toBe(false);
  requestDevice.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
  await midi.connectBluetooth();
  expect(midi.bluetoothError).toContain('Bluetooth permission denied');
  expect(midi.bluetoothError).toContain('system settings');
  await midi.connectBluetooth();
  expect(midi.bluetoothReady).toBe(true);
  expect(midi.bluetoothError).toBe('');
});

test('a missing MIDI service is reported rather than treated as picker cancellation', async () => {
  device.getPrimaryService.mockRejectedValue(
    new DOMException('MIDI service missing', 'NotFoundError'),
  );
  await midi.connectBluetooth();
  expect(midi.bluetoothError).toBe('MIDI service missing');
  expect(midi.bluetoothConnecting).toBe(false);
  expect(midi.bluetoothReady).toBe(false);
  expect(device.gatt.disconnect).toHaveBeenCalledOnce();
});

test('failed notifications detach listeners and close the connection before retrying', async () => {
  const remove = vi.spyOn(device.characteristic, 'removeEventListener');
  device.characteristic.startNotifications.mockRejectedValueOnce(new Error('Notifications failed'));
  await midi.connectBluetooth();
  expect(midi.bluetoothError).toBe('Notifications failed');
  expect(midi.bluetoothReady).toBe(false);
  expect(midi.inputs).toEqual({});
  expect(device.gatt.disconnect).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledWith('characteristicvaluechanged', expect.any(Function));
  device.characteristic.packet([0x80, 0x81, 0x90, 60, 100]);
  expect(midi.pressedPitches).toEqual([]);
  await midi.connectBluetooth();
  expect(midi.bluetoothReady).toBe(true);
  device.characteristic.packet([0x80, 0x81, 0x90, 64, 100]);
  expect(midi.pressedPitches).toEqual([64]);
});

test('Bluetooth and System MIDI retain overlapping notes independently when either disconnects', async () => {
  const usb = {
    id: 'usb',
    type: 'input',
    name: 'USB keyboard',
    state: 'connected',
    onmidimessage: null as ((event: Pick<MIDIMessageEvent, 'data'>) => void) | null,
    close: vi.fn().mockResolvedValue(undefined),
  };
  requestMIDIAccess.mockResolvedValue({ inputs: new Map([[usb.id, usb]]), onstatechange: null });
  await midi.connect();
  await midi.connectBluetooth();
  usb.onmidimessage!({ data: new Uint8Array([0x90, 60, 100]) });
  device.characteristic.packet([0x80, 0x81, 0x90, 60, 100, 64, 100, 0x82, 0x95, 67, 100]);
  expect(midi.connectedCount).toBe(2);
  expect(midi.pressedPitches).toEqual([60, 64, 67]);
  device.characteristic.packet([0x80, 0x83, 0xb5, 120, 0]);
  expect(midi.pressedPitches).toEqual([60, 64]);
  midi.disconnectBluetooth();
  expect(midi.pressedPitches).toEqual([60]);
  expect(midi.ready).toBe(true);
  expect(midi.bluetoothReady).toBe(false);
  await midi.connectBluetooth();
  device.characteristic.packet([0x80, 0x81, 0x90, 60, 100, 64, 100]);
  midi.disconnect();
  expect(midi.bluetoothReady).toBe(true);
  expect(midi.connectedCount).toBe(1);
  expect(midi.pressedPitches).toEqual([60, 64]);
  device.characteristic.packet([0x80, 0x82, 0x80, 60, 0]);
  expect(midi.pressedPitches).toEqual([64]);
});

test('an unexpected Bluetooth disconnect clears held keys and allows selecting the keyboard again', async () => {
  await midi.connectBluetooth();
  device.characteristic.packet([0x80, 0x81, 0x90, 60, 100]);
  device.dispatchEvent(new Event('gattserverdisconnected'));
  expect(midi.bluetoothReady).toBe(false);
  expect(midi.pressedPitches).toEqual([]);
  expect(midi.connectedCount).toBe(0);
  expect(midi.inputs['bluetooth:keyboard']?.state).toBe('disconnected');
  device.characteristic.packet([0x80, 0x81, 0x90, 64, 100]);
  expect(midi.pressedPitches).toEqual([]);
  await midi.connectBluetooth();
  expect(Object.keys(midi.inputs)).toEqual(['bluetooth:keyboard']);
  expect(midi.bluetoothReady).toBe(true);
});

test('unsupported APIs and insecure origins never open a Bluetooth picker', async () => {
  for (const [secure, navigatorValue, message] of [
    [false, { bluetooth: { requestDevice } }, 'Bluetooth MIDI requires HTTPS or localhost.'],
    [true, { requestMIDIAccess }, 'Web Bluetooth is unavailable in this browser.'],
  ] as const) {
    midi.$dispose();
    vi.stubGlobal('isSecureContext', secure);
    vi.stubGlobal('navigator', navigatorValue);
    midi = useMidiStore(createPinia());
    expect(midi.bluetoothUnavailable).toContain(message);
    await midi.connectBluetooth();
    expect(midi.bluetoothConnecting).toBe(false);
  }
  expect(requestDevice).not.toHaveBeenCalled();
});

test('Bluetooth connects without a Web MIDI API and skips a read that the device does not expose', async () => {
  midi.$dispose();
  vi.stubGlobal('navigator', { bluetooth: { requestDevice } });
  midi = useMidiStore(createPinia());
  device.characteristic.properties.read = false;
  await midi.connectBluetooth();
  expect(midi.unavailable).not.toBe('');
  expect(midi.bluetoothReady).toBe(true);
  expect(device.characteristic.readValue).not.toHaveBeenCalled();
});

test('disposing a connected store closes Bluetooth, removes listeners, and clears held notes', async () => {
  const removeDevice = vi.spyOn(device, 'removeEventListener');
  const removeCharacteristic = vi.spyOn(device.characteristic, 'removeEventListener');
  await midi.connectBluetooth();
  device.characteristic.packet([0x80, 0x81, 0x90, 60, 100]);
  midi.$dispose();
  expect(midi.pressedPitches).toEqual([]);
  expect(device.gatt.disconnect).toHaveBeenCalledOnce();
  expect(removeDevice).toHaveBeenCalledWith('gattserverdisconnected', expect.any(Function));
  expect(removeCharacteristic).toHaveBeenCalledWith(
    'characteristicvaluechanged',
    expect.any(Function),
  );
});

test('a picker resolved after disposal never starts a GATT connection', async () => {
  let choose!: (value: Device) => void;
  requestDevice.mockImplementation(() => new Promise<Device>((resolve) => (choose = resolve)));
  const pending = midi.connectBluetooth();
  midi.$dispose();
  choose(device);
  await pending;
  expect(device.gatt.connect).not.toHaveBeenCalled();
  expect(midi.bluetoothReady).toBe(false);
  expect(midi.inputs).toEqual({});
});

test('a GATT connection completed after disposal is closed and never subscribes', async () => {
  let finish!: (value: { getPrimaryService: Device['getPrimaryService'] }) => void;
  device.gatt.connect.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  const pending = midi.connectBluetooth();
  await vi.waitFor(() => expect(device.gatt.connect).toHaveBeenCalledOnce());
  midi.$dispose();
  finish({ getPrimaryService: device.getPrimaryService });
  await pending;
  expect(device.gatt.disconnect).toHaveBeenCalledTimes(2);
  expect(device.getPrimaryService).not.toHaveBeenCalled();
  expect(midi.bluetoothReady).toBe(false);
});

test('disconnecting during notification startup prevents a stale connection from becoming ready', async () => {
  let finish!: (value: Characteristic) => void;
  device.characteristic.startNotifications.mockImplementation(
    () => new Promise<Characteristic>((resolve) => (finish = resolve)),
  );
  const pending = midi.connectBluetooth();
  await vi.waitFor(() => expect(device.characteristic.startNotifications).toHaveBeenCalledOnce());
  expect(midi.connectedCount).toBe(0);
  midi.disconnectBluetooth();
  finish(device.characteristic);
  await pending;
  expect(midi.bluetoothReady).toBe(false);
  expect(midi.inputs).toEqual({});
});

test('an old canceled request cannot replace a newer Bluetooth connection or its error state', async () => {
  let reject!: (reason: Error) => void;
  requestDevice.mockImplementationOnce(() => new Promise((_resolve, fail) => (reject = fail)));
  const old = midi.connectBluetooth();
  midi.disconnectBluetooth();
  await midi.connectBluetooth();
  reject(new Error('Old request failed'));
  await old;
  expect(midi.bluetoothReady).toBe(true);
  expect(midi.bluetoothConnecting).toBe(false);
  expect(midi.bluetoothError).toBe('');
});

test('refresh restores only the last connected keyboard without opening the device picker', async () => {
  await midi.connectBluetooth();
  expect(saved.get('bluetooth-midi-device')).toBe(device.id);
  midi.$dispose();
  expect(saved.get('bluetooth-midi-device')).toBe(device.id);
  const other = new Device();
  other.id = 'other-keyboard';
  device = new Device();
  getDevices.mockResolvedValue([other, device]);
  requestDevice.mockClear();
  midi = useMidiStore(createPinia());
  await midi.restoreBluetooth();
  expect(getDevices).toHaveBeenCalledOnce();
  expect(requestDevice).not.toHaveBeenCalled();
  expect(other.gatt.connect).not.toHaveBeenCalled();
  expect(device.gatt.connect).toHaveBeenCalledOnce();
  expect(device.characteristic.readValue).toHaveBeenCalledOnce();
  expect(device.characteristic.startNotifications).toHaveBeenCalledOnce();
  expect(midi.bluetoothReady).toBe(true);
  device.characteristic.packet([0x80, 0x81, 0x90, 60, 100]);
  expect(midi.pressedPitches).toEqual([60]);
});

test('restoration discovers the authorized keyboard before connecting and stops scanning', async () => {
  saved.set('bluetooth-midi-device', device.id);
  const watch = vi.fn().mockResolvedValue(undefined);
  device.watchAdvertisements = watch;
  const remove = vi.spyOn(device, 'removeEventListener');
  const pending = midi.restoreBluetooth();
  await vi.waitFor(() => expect(watch).toHaveBeenCalledOnce());
  expect(device.gatt.connect).not.toHaveBeenCalled();
  expect(midi.bluetoothConnecting).toBe(true);
  device.dispatchEvent(new Event('advertisementreceived'));
  await pending;
  expect(watch.mock.calls[0]![0].signal.aborted).toBe(true);
  expect(remove).toHaveBeenCalledWith('advertisementreceived', expect.any(Function));
  expect(device.gatt.connect).toHaveBeenCalledOnce();
  expect(midi.bluetoothReady).toBe(true);
  expect(midi.bluetoothConnecting).toBe(false);
  expect(requestDevice).not.toHaveBeenCalled();
});

test('an unavailable remembered keyboard times out without forgetting it or opening a picker', async () => {
  vi.useFakeTimers();
  saved.set('bluetooth-midi-device', device.id);
  const watch = vi.fn().mockResolvedValue(undefined);
  device.watchAdvertisements = watch;
  const pending = midi.restoreBluetooth();
  await vi.waitFor(() => expect(watch).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(10000);
  await pending;
  expect(watch.mock.calls[0]![0].signal.aborted).toBe(true);
  expect(midi.bluetoothError).toContain('Turn it on');
  expect(midi.bluetoothConnecting).toBe(false);
  expect(midi.bluetoothReady).toBe(false);
  expect(device.gatt.connect).not.toHaveBeenCalled();
  expect(saved.get('bluetooth-midi-device')).toBe(device.id);
  expect(requestDevice).not.toHaveBeenCalled();
});

test('explicit disconnect forgets the keyboard while unexpected disconnect preserves it', async () => {
  await midi.connectBluetooth();
  device.dispatchEvent(new Event('gattserverdisconnected'));
  expect(saved.get('bluetooth-midi-device')).toBe(device.id);
  await midi.restoreBluetooth();
  expect(midi.bluetoothReady).toBe(true);
  midi.disconnectBluetooth();
  expect(saved.has('bluetooth-midi-device')).toBe(false);
  midi.$dispose();
  midi = useMidiStore(createPinia());
  getDevices.mockClear();
  await midi.restoreBluetooth();
  expect(getDevices).not.toHaveBeenCalled();
});

test('first visits and browsers without getDevices never initiate automatic pairing', async () => {
  await midi.restoreBluetooth();
  expect(getDevices).not.toHaveBeenCalled();
  saved.set('bluetooth-midi-device', device.id);
  midi.$dispose();
  vi.stubGlobal('navigator', { bluetooth: { requestDevice } });
  midi = useMidiStore(createPinia());
  expect(midi.bluetoothRestoreUnavailable).toContain('after a page refresh');
  await midi.restoreBluetooth();
  expect(requestDevice).not.toHaveBeenCalled();
  expect(saved.get('bluetooth-midi-device')).toBe(device.id);
  await midi.connectBluetooth();
  expect(midi.bluetoothReady).toBe(true);
});

test('missing persistent permission requests a manual selection without opening the picker', async () => {
  saved.set('bluetooth-midi-device', device.id);
  getDevices.mockResolvedValue([]);
  await midi.restoreBluetooth();
  expect(midi.bluetoothError).toContain('permission was not retained');
  expect(midi.bluetoothError).toContain('Select your keyboard again');
  expect(midi.bluetoothConnecting).toBe(false);
  expect(midi.bluetoothReady).toBe(false);
  expect(requestDevice).not.toHaveBeenCalled();
});

test('failed restoration keeps the preference so a later refresh can retry', async () => {
  saved.set('bluetooth-midi-device', device.id);
  device.gatt.connect.mockRejectedValueOnce(new Error('Keyboard unavailable'));
  await midi.restoreBluetooth();
  expect(midi.bluetoothError).toBe('Keyboard unavailable');
  expect(saved.get('bluetooth-midi-device')).toBe(device.id);
  midi.$dispose();
  midi = useMidiStore(createPinia());
  await midi.restoreBluetooth();
  expect(midi.bluetoothReady).toBe(true);
  expect(midi.bluetoothError).toBe('');
  expect(requestDevice).not.toHaveBeenCalled();
});

test('disposing while discovering a remembered keyboard cancels scanning and preserves the preference', async () => {
  saved.set('bluetooth-midi-device', device.id);
  const watch = vi.fn().mockResolvedValue(undefined);
  device.watchAdvertisements = watch;
  const pending = midi.restoreBluetooth();
  await vi.waitFor(() => expect(watch).toHaveBeenCalledOnce());
  midi.$dispose();
  await pending;
  expect(watch.mock.calls[0]![0].signal.aborted).toBe(true);
  expect(saved.get('bluetooth-midi-device')).toBe(device.id);
  device.dispatchEvent(new Event('advertisementreceived'));
  expect(device.gatt.connect).not.toHaveBeenCalled();
  expect(midi.bluetoothError).toBe('');
});

test('stale device retrieval cannot overwrite a newer connection', async () => {
  saved.set('bluetooth-midi-device', device.id);
  let finish!: (devices: Device[]) => void;
  getDevices.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  const old = midi.restoreBluetooth();
  midi.disconnectBluetooth();
  await midi.connectBluetooth();
  finish([]);
  await old;
  expect(midi.bluetoothReady).toBe(true);
  expect(midi.bluetoothError).toBe('');
  expect(saved.get('bluetooth-midi-device')).toBe(device.id);
});

test('disabled storage leaves manual Bluetooth usable and skips restoration', async () => {
  vi.stubGlobal('localStorage', {
    getItem() {
      throw new DOMException('Storage blocked', 'SecurityError');
    },
    setItem() {
      throw new DOMException('Storage blocked', 'SecurityError');
    },
    removeItem() {
      throw new DOMException('Storage blocked', 'SecurityError');
    },
  });
  await midi.restoreBluetooth();
  expect(getDevices).not.toHaveBeenCalled();
  await midi.connectBluetooth();
  expect(midi.bluetoothReady).toBe(true);
  expect(midi.bluetoothError).toBe('');
  midi.disconnectBluetooth();
  expect(midi.bluetoothReady).toBe(false);
});
