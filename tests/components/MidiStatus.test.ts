import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia } from 'pinia';
import { useMidiStore } from '../../src/stores/midi';
import MidiStatus from '../../src/components/MidiStatus.vue';

const requestMIDIAccess = vi.fn();

beforeEach(() => {
  requestMIDIAccess.mockReset();
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { requestMIDIAccess });
});

afterEach(() => vi.unstubAllGlobals());

function fieldContent(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test('the field shows connection status without requesting MIDI access', async () => {
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  const initial = await renderToString(createSSRApp(MidiStatus).use(pinia));
  expect(fieldContent(initial)).toBe('MIDI Not connected');
  expect(initial).not.toMatch(/<button|<dialog/);
  expect(requestMIDIAccess).not.toHaveBeenCalled();
  midi.connecting = true;
  const pending = await renderToString(createSSRApp(MidiStatus).use(pinia));
  expect(fieldContent(pending)).toBe('MIDI Connecting…');
});

test('the field shows only connection status instead of device details', async () => {
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  midi.ready = true;
  midi.inputs = {
    usb: { name: 'USB keyboard', state: 'connected', transport: 'midi', pressed: {} },
    ble: { name: 'BLE keyboard', state: 'disconnected', transport: 'midi', pressed: {} },
    unnamed: { name: null, state: 'connected', transport: 'midi', pressed: {} },
  };
  const html = await renderToString(createSSRApp(MidiStatus).use(pinia));
  expect(fieldContent(html)).toBe('MIDI Connected');
  expect(html).not.toMatch(/USB keyboard|BLE keyboard|Unnamed MIDI input/);
});

test('the field shows the detected chord as held keys change, and Connected after release', async () => {
  const input = {
    id: 'keyboard',
    type: 'input',
    name: 'Keyboard',
    manufacturer: 'Keyboard maker',
    state: 'connected',
    onmidimessage: null as ((event: Pick<MIDIMessageEvent, 'data'>) => void) | null,
    close: vi.fn().mockResolvedValue(undefined),
  };
  requestMIDIAccess.mockResolvedValue({
    inputs: new Map([[input.id, input]]),
    onstatechange: null,
  });
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  try {
    await midi.connect();
    const idle = await renderToString(createSSRApp(MidiStatus).use(pinia));
    expect(fieldContent(idle)).toBe('MIDI Connected');
    expect(idle).not.toContain('Keyboard maker');
    input.onmidimessage!({ data: new Uint8Array([0x90, 60, 100]) });
    expect(fieldContent(await renderToString(createSSRApp(MidiStatus).use(pinia)))).toBe(
      'MIDI C4 · 1 note',
    );
    for (const pitch of [64, 67]) {
      input.onmidimessage!({ data: new Uint8Array([0x90, pitch, 100]) });
    }
    const pressed = await renderToString(createSSRApp(MidiStatus).use(pinia));
    expect(fieldContent(pressed)).toBe('MIDI CM · 3 notes');
    expect(pressed).toContain('title="C4 · E4 · G4"');
    input.onmidimessage!({ data: new Uint8Array([0x90, 69, 100]) });
    const chord = await renderToString(createSSRApp(MidiStatus).use(pinia));
    expect(fieldContent(chord)).toBe('MIDI C6 · 4 notes');
    expect(chord).toContain('title="C4 · E4 · G4 · A4"');
    input.onmidimessage!({ data: new Uint8Array([0x80, 69, 0]) });
    expect(fieldContent(await renderToString(createSSRApp(MidiStatus).use(pinia)))).toBe(
      'MIDI CM · 3 notes',
    );
    for (const pitch of [60, 64, 67]) {
      input.onmidimessage!({ data: new Uint8Array([0x80, pitch, 0]) });
    }
    const released = await renderToString(createSSRApp(MidiStatus).use(pinia));
    expect(fieldContent(released)).toBe('MIDI Connected');
  } finally {
    midi.$dispose();
  }
});

test('unrecognized held keys show their note list followed by a separate count', async () => {
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  midi.inputs = {
    keyboard: {
      name: 'Keyboard',
      state: 'connected',
      transport: 'bluetooth',
      pressed: { 0: new Set([60, 61]) },
    },
  };
  const html = await renderToString(createSSRApp(MidiStatus).use(pinia));
  expect(fieldContent(html)).toBe('MIDI C4 · C♯4 · 2 notes');
  expect(html).toContain('title="C4 · C♯4"');
  expect(html).not.toContain('Unrecognized');
});

test('C, G, and A use the note list when chord detection has no match', async () => {
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  midi.inputs = {
    keyboard: {
      name: 'Keyboard',
      state: 'connected',
      transport: 'bluetooth',
      pressed: { 0: new Set([60, 67, 69]) },
    },
  };
  const html = await renderToString(createSSRApp(MidiStatus).use(pinia));
  expect(fieldContent(html)).toBe('MIDI C4 · G4 · A4 · 3 notes');
  expect(html).toContain('title="C4 · G4 · A4"');
});

test('long note lists truncate independently of the non-shrinking held-key count', async () => {
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  const pitches = Array.from({ length: 88 }, (_, index) => index + 21);
  midi.inputs = {
    keyboard: {
      name: 'Keyboard',
      state: 'connected',
      transport: 'bluetooth',
      pressed: { 0: new Set(pitches) },
    },
  };
  const html = await renderToString(createSSRApp(MidiStatus).use(pinia));
  expect(html).toMatch(/<span class="min-w-0 truncate">A0 · A♯0 · B0[^<]*C8<\/span>/);
  expect(html).toContain('<span class="shrink-0 whitespace-pre"> · 88 notes</span>');
  expect(html).not.toContain('Unrecognized');
  expect(html).toContain('title="A0 · A♯0 · B0');
  expect(html).toContain('C8"');
});

test('chords combine pitches from both transports and preserve the lowest pitch as the bass', async () => {
  vi.stubGlobal('navigator', { bluetooth: { requestDevice: vi.fn() } });
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  midi.error = 'System MIDI permission denied.';
  midi.inputs = {
    usb: { name: 'USB', state: 'connected', transport: 'midi', pressed: { 0: new Set([62, 60]) } },
    bluetooth: {
      name: 'Bluetooth',
      state: 'connected',
      transport: 'bluetooth',
      pressed: { 2: new Set([57, 54]) },
    },
  };
  const html = await renderToString(createSSRApp(MidiStatus).use(pinia));
  expect(fieldContent(html)).toBe('MIDI D7/F# · 4 notes');
  expect(html).toContain('title="F♯3 · A3 · C4 · D4"');
});

test('a major seventh chord follows the same name and key-count format', async () => {
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  midi.inputs = {
    keyboard: {
      name: 'Keyboard',
      state: 'connected',
      transport: 'bluetooth',
      pressed: { 0: new Set([60, 64, 67, 71]) },
    },
  };
  const html = await renderToString(createSSRApp(MidiStatus).use(pinia));
  expect(fieldContent(html)).toBe('MIDI Cmaj7 · 4 notes');
  expect(html).toContain('title="C4 · E4 · G4 · B4"');
});

test('Bluetooth availability prevents an unavailable System MIDI API from hiding the connection', async () => {
  vi.stubGlobal('navigator', { bluetooth: { requestDevice: vi.fn() } });
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  expect(fieldContent(await renderToString(createSSRApp(MidiStatus).use(pinia)))).toBe(
    'MIDI Not connected',
  );
  midi.bluetoothConnecting = true;
  expect(fieldContent(await renderToString(createSSRApp(MidiStatus).use(pinia)))).toBe(
    'MIDI Connecting…',
  );
  midi.bluetoothConnecting = false;
  midi.bluetoothError = 'Connection failed.';
  const failed = await renderToString(createSSRApp(MidiStatus).use(pinia));
  expect(fieldContent(failed)).toBe('MIDI Error');
  expect(failed).toContain('Connection failed.');
});

test('an empty device list and connection errors show compact status', async () => {
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  midi.ready = true;
  const empty = await renderToString(createSSRApp(MidiStatus).use(pinia));
  expect(fieldContent(empty)).toBe('MIDI No device');
  midi.ready = false;
  midi.error = 'MIDI permission denied.';
  const denied = await renderToString(createSSRApp(MidiStatus).use(pinia));
  expect(fieldContent(denied)).toBe('MIDI Error');
  expect(denied).toContain('MIDI permission denied.');
});

test('an unsupported browser shows compact status with an explanatory title', async () => {
  vi.stubGlobal('navigator', {});
  const html = await renderToString(createSSRApp(MidiStatus).use(createPinia()));
  expect(fieldContent(html)).toBe('MIDI Unavailable');
  expect(html).toContain('Web MIDI is unavailable in this browser.');
  expect(requestMIDIAccess).not.toHaveBeenCalled();
});
