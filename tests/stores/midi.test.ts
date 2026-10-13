import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { createPinia } from 'pinia';
import { useMidiStore } from '../../src/stores/midi';

type Port = {
  id: MIDIPort['id'];
  type: MIDIPort['type'];
  name: MIDIPort['name'];
  state: MIDIPort['state'];
  onmidimessage: ((event: Pick<MIDIMessageEvent, 'data'>) => void) | null;
  close: () => Promise<void>;
};

function createInput(id: string, name: string): Port {
  return {
    id,
    type: 'input',
    name,
    state: 'connected',
    onmidimessage: null,
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function message(port: Port, data: number[] | null) {
  port.onmidimessage!({ data: data ? new Uint8Array(data) : null });
}

function createAccess(ports: Port[] = []) {
  return {
    inputs: new Map(ports.map((port) => [port.id, port])),
    onstatechange: null as ((event: { port: Port | null }) => void) | null,
  };
}

const requestMIDIAccess = vi.fn();
let midi: ReturnType<typeof useMidiStore>;
let usb: Port;
let ble: Port;

beforeEach(() => {
  requestMIDIAccess.mockReset();
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { requestMIDIAccess });
  midi = useMidiStore(createPinia());
  usb = createInput('usb', 'USB keyboard');
  ble = createInput('ble', 'BLE keyboard');
});

afterEach(() => {
  midi.$dispose();
  vi.unstubAllGlobals();
});

test('MIDI access is requested explicitly without SysEx, and duplicate requests are prevented', async () => {
  const access = createAccess([usb, ble]);
  let allow!: (value: typeof access) => void;
  requestMIDIAccess.mockImplementation(
    () =>
      new Promise<typeof access>((resolve) => {
        allow = resolve;
      }),
  );
  expect(requestMIDIAccess).not.toHaveBeenCalled();
  expect(midi.ready).toBe(false);
  const connecting = midi.connect();
  expect(midi.connecting).toBe(true);
  await midi.connect();
  expect(requestMIDIAccess).toHaveBeenCalledExactlyOnceWith({ sysex: false });
  allow(access);
  await connecting;
  expect(midi.connecting).toBe(false);
  expect(midi.ready).toBe(true);
  expect(midi.connectedCount).toBe(2);
  expect(midi.inputs.usb).toEqual({
    name: usb.name,
    state: 'connected',
    transport: 'midi',
    pressed: {},
  });
  expect(midi.inputs.ble?.name).toBe(ble.name);
  await midi.connect();
  expect(requestMIDIAccess).toHaveBeenCalledOnce();
});

test('attack listeners receive each note-on on every channel and can unsubscribe', async () => {
  requestMIDIAccess.mockResolvedValue(createAccess([usb, ble]));
  await midi.connect();
  const attacks: number[] = [];
  const unsubscribe = midi.onNoteOn((pitch) => attacks.push(pitch));
  message(usb, [0x90, 60, 100]);
  message(usb, [0x90, 60, 100]);
  message(ble, [0x92, 64, 40]);
  message(usb, [0x80, 60, 0]);
  message(ble, [0x92, 64, 0]);
  message(usb, [0xb0, 64, 127]);
  expect(attacks).toEqual([60, 60, 64]);
  unsubscribe();
  message(usb, [0x90, 67, 100]);
  expect(attacks).toEqual([60, 60, 64]);
});

test('hotplug updates inputs and retains disconnected devices without duplicating a reconnected port', async () => {
  const access = createAccess();
  requestMIDIAccess.mockResolvedValue(access);
  await midi.connect();
  expect(midi.ready).toBe(true);
  expect(midi.connectedCount).toBe(0);
  access.onstatechange!({ port: usb });
  access.onstatechange!({ port: ble });
  access.inputs.set(usb.id, usb);
  access.inputs.set(ble.id, ble);
  expect(midi.connectedCount).toBe(2);
  usb.state = 'disconnected';
  access.inputs.delete(usb.id);
  access.onstatechange!({ port: usb });
  expect(midi.inputs.usb?.state).toBe('disconnected');
  expect(midi.connectedCount).toBe(1);
  usb.state = 'connected';
  usb.name = 'Reconnected keyboard';
  access.inputs.set(usb.id, usb);
  access.onstatechange!({ port: usb });
  expect(Object.keys(midi.inputs)).toHaveLength(2);
  expect(midi.inputs.usb?.name).toBe('Reconnected keyboard');
  expect(midi.connectedCount).toBe(2);
  access.onstatechange!({ port: { ...usb, id: 'output', type: 'output' } });
  access.onstatechange!({ port: null });
  expect(Object.keys(midi.inputs)).toHaveLength(2);
  usb.state = 'disconnected';
  ble.state = 'disconnected';
  access.onstatechange!({ port: usb });
  access.onstatechange!({ port: ble });
  expect(midi.connectedCount).toBe(0);
  expect(midi.ready).toBe(true);
});

test('permission denial is actionable and a later retry can succeed', async () => {
  requestMIDIAccess
    .mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'))
    .mockResolvedValueOnce(createAccess([usb]));
  await midi.connect();
  expect(midi.ready).toBe(false);
  expect(midi.connecting).toBe(false);
  expect(midi.error).toContain('MIDI permission denied');
  expect(midi.error).toContain('try again');
  await midi.connect();
  expect(midi.error).toBe('');
  expect(midi.ready).toBe(true);
  expect(midi.connectedCount).toBe(1);
});

test('a MIDI service error leaves connection controls available for retry', async () => {
  requestMIDIAccess.mockRejectedValue(new Error('MIDI service unavailable'));
  await midi.connect();
  expect(midi.error).toBe('MIDI service unavailable');
  expect(midi.connecting).toBe(false);
  expect(midi.ready).toBe(false);
  expect(midi.inputs).toEqual({});
});

test('unsupported browsers and insecure origins report the cause without requesting MIDI access', async () => {
  for (const [secure, navigatorValue, message] of [
    [false, { requestMIDIAccess }, 'MIDI requires HTTPS or localhost.'],
    [true, {}, 'Web MIDI is unavailable in this browser. Use desktop Chrome or Edge.'],
  ] as const) {
    midi.$dispose();
    vi.stubGlobal('isSecureContext', secure);
    vi.stubGlobal('navigator', navigatorValue);
    midi = useMidiStore(createPinia());
    expect(midi.unavailable).toBe(message);
    await midi.connect();
    expect(midi.ready).toBe(false);
    expect(midi.connecting).toBe(false);
  }
  expect(requestMIDIAccess).not.toHaveBeenCalled();
});

test('disposing the store clears held keys, removes listeners, and closes its input ports', async () => {
  const access = createAccess([usb]);
  requestMIDIAccess.mockResolvedValue(access);
  await midi.connect();
  expect(access.onstatechange).not.toBeNull();
  message(usb, [0x90, 60, 100]);
  expect(midi.pressedPitches).toEqual([60]);
  midi.$dispose();
  expect(access.onstatechange).toBeNull();
  expect(usb.onmidimessage).toBeNull();
  expect(usb.close).toHaveBeenCalledOnce();
  expect(midi.pressedPitches).toEqual([]);
});

test('disconnect closes input ports, clears held notes, and allows connecting again', async () => {
  const access = createAccess([usb, ble]);
  requestMIDIAccess.mockResolvedValue(access);
  await midi.connect();
  message(usb, [0x90, 60, 100]);
  message(ble, [0x90, 64, 100]);
  midi.disconnect();
  expect(midi.ready).toBe(false);
  expect(midi.inputs).toEqual({});
  expect(midi.pressedPitches).toEqual([]);
  expect(access.onstatechange).toBeNull();
  for (const port of [usb, ble]) {
    expect(port.onmidimessage).toBeNull();
    expect(port.close).toHaveBeenCalledOnce();
  }
  await midi.connect();
  expect(requestMIDIAccess).toHaveBeenCalledTimes(2);
  expect(midi.ready).toBe(true);
  expect(midi.connectedCount).toBe(2);
  message(usb, [0x90, 67, 100]);
  expect(midi.pressedPitches).toEqual([67]);
});

test('a request resolved after disposal does not attach a device listener', async () => {
  const access = createAccess([usb]);
  let allow!: (value: typeof access) => void;
  requestMIDIAccess.mockImplementation(
    () =>
      new Promise<typeof access>((resolve) => {
        allow = resolve;
      }),
  );
  const connecting = midi.connect();
  midi.$dispose();
  allow(access);
  await connecting;
  expect(access.onstatechange).toBeNull();
  expect(midi.ready).toBe(false);
  expect(midi.inputs).toEqual({});
  expect(usb.onmidimessage).toBeNull();
});

test('note messages track chords and both forms of note release while ignoring unrelated messages', async () => {
  requestMIDIAccess.mockResolvedValue(createAccess([usb]));
  await midi.connect();
  expect(midi.pressedPitches).toEqual([]);
  message(usb, [0x90, 67, 100]);
  message(usb, [0x90, 60, 1]);
  message(usb, [0x90, 64, 127]);
  message(usb, [0x90, 60, 80]);
  expect(midi.pressedPitches).toEqual([60, 64, 67]);
  for (const data of [null, [0xf8], [0x90, 60], [0xa0, 60, 10], [0xb0, 64, 127]]) {
    message(usb, data);
  }
  expect(midi.pressedPitches).toEqual([60, 64, 67]);
  message(usb, [0x80, 64, 100]);
  expect(midi.pressedPitches).toEqual([60, 67]);
  message(usb, [0x90, 60, 0]);
  expect(midi.pressedPitches).toEqual([67]);
  message(usb, [0x80, 67, 0]);
  expect(midi.pressedPitches).toEqual([]);
});

test('overlapping pitches stay pressed until released on every device and channel', async () => {
  requestMIDIAccess.mockResolvedValue(createAccess([usb, ble]));
  await midi.connect();
  message(usb, [0x90, 60, 100]);
  message(usb, [0x95, 60, 100]);
  message(usb, [0x95, 64, 100]);
  message(ble, [0x90, 60, 100]);
  expect(midi.pressedPitches).toEqual([60, 64]);
  message(usb, [0xb5, 123, 0]);
  expect(midi.pressedPitches).toEqual([60]);
  message(usb, [0x80, 60, 0]);
  expect(midi.pressedPitches).toEqual([60]);
  message(ble, [0xb0, 120, 0]);
  expect(midi.pressedPitches).toEqual([]);
});

test('hotplugged keyboards receive note handlers and disconnect clears only their held keys', async () => {
  const access = createAccess([usb]);
  requestMIDIAccess.mockResolvedValue(access);
  await midi.connect();
  message(usb, [0x90, 60, 100]);
  const handler = usb.onmidimessage;
  access.onstatechange!({ port: usb });
  expect(usb.onmidimessage).toBe(handler);
  expect(midi.pressedPitches).toEqual([60]);
  access.inputs.set(ble.id, ble);
  access.onstatechange!({ port: ble });
  message(ble, [0x90, 72, 100]);
  expect(midi.pressedPitches).toEqual([60, 72]);
  ble.state = 'disconnected';
  access.inputs.delete(ble.id);
  access.onstatechange!({ port: ble });
  expect(ble.onmidimessage).toBeNull();
  expect(midi.pressedPitches).toEqual([60]);
  const reconnected = createInput(ble.id, 'BLE keyboard');
  access.inputs.set(reconnected.id, reconnected);
  access.onstatechange!({ port: reconnected });
  expect(midi.pressedPitches).toEqual([60]);
  message(reconnected, [0x90, 78, 100]);
  expect(midi.pressedPitches).toEqual([60, 78]);
});
