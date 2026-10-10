import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia } from 'pinia';
import { useMidiStore } from '../stores/midi';
import MidiStatus from './MidiStatus.vue';

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
    usb: { name: 'USB keyboard', state: 'connected', pressed: {} },
    ble: { name: 'BLE keyboard', state: 'disconnected', pressed: {} },
    unnamed: { name: null, state: 'connected', pressed: {} },
  };
  const html = await renderToString(createSSRApp(MidiStatus).use(pinia));
  expect(fieldContent(html)).toBe('MIDI Connected');
  expect(html).not.toMatch(/USB keyboard|BLE keyboard|Unnamed MIDI input/);
});

test('the field shows up to three pressed pitches, a count for more, and Connected after release', async () => {
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
    for (const pitch of [60, 64, 66]) {
      input.onmidimessage!({ data: new Uint8Array([0x90, pitch, 100]) });
    }
    const pressed = await renderToString(createSSRApp(MidiStatus).use(pinia));
    expect(fieldContent(pressed)).toBe('MIDI C4 · E4 · F♯4');
    input.onmidimessage!({ data: new Uint8Array([0x90, 67, 100]) });
    const chord = await renderToString(createSSRApp(MidiStatus).use(pinia));
    expect(fieldContent(chord)).toBe('MIDI 4 notes');
    expect(chord).toContain('title="C4 · E4 · F♯4 · G4"');
    input.onmidimessage!({ data: new Uint8Array([0x80, 67, 0]) });
    expect(fieldContent(await renderToString(createSSRApp(MidiStatus).use(pinia)))).toBe(
      'MIDI C4 · E4 · F♯4',
    );
    for (const pitch of [60, 64, 66]) {
      input.onmidimessage!({ data: new Uint8Array([0x80, pitch, 0]) });
    }
    const released = await renderToString(createSSRApp(MidiStatus).use(pinia));
    expect(fieldContent(released)).toBe('MIDI Connected');
  } finally {
    midi.$dispose();
  }
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
