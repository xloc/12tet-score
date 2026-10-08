import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia } from 'pinia';
import { useMidiStore } from '../stores/midi';
import MidiPanel from './MidiPanel.vue';

const requestMIDIAccess = vi.fn();

beforeEach(() => {
  requestMIDIAccess.mockReset();
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { requestMIDIAccess });
});

afterEach(() => vi.unstubAllGlobals());

test('the panel offers an explicit connect action and disables it while permission is pending', async () => {
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  const initial = await renderToString(createSSRApp(MidiPanel).use(pinia));
  expect(initial).toContain('MIDI device');
  expect(initial).toContain('Connect MIDI');
  expect(initial).toContain('Not connected');
  expect(requestMIDIAccess).not.toHaveBeenCalled();
  midi.connecting = true;
  const pending = await renderToString(createSSRApp(MidiPanel).use(pinia));
  expect(pending).toContain('Connecting…');
  expect(pending).toMatch(/<button\b[^>]*disabled/);
});

test('the panel shows device names, disconnected devices, and connection status', async () => {
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  midi.ready = true;
  midi.inputs = {
    usb: { name: 'USB keyboard', state: 'connected', pressed: {} },
    ble: { name: 'BLE keyboard', state: 'disconnected', pressed: {} },
    unnamed: { name: null, state: 'connected', pressed: {} },
  };
  const html = await renderToString(createSSRApp(MidiPanel).use(pinia));
  expect(html).toContain('USB keyboard');
  expect(html).toContain('BLE keyboard');
  expect(html).toContain('Connected');
  expect(html).toContain('BLE keyboard (disconnected)');
  expect(html).toContain('Unnamed MIDI input');
  expect(html).not.toContain('Connect MIDI');
});

test('received key presses render as note names and disappear when released', async () => {
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
    const idle = await renderToString(createSSRApp(MidiPanel).use(pinia));
    expect(idle).toMatch(/<dd\b[^>]*>—<\/dd>/);
    expect(idle).not.toContain('Keyboard maker');
    for (const pitch of [60, 64, 66]) {
      input.onmidimessage!({ data: new Uint8Array([0x90, pitch, 100]) });
    }
    const pressed = await renderToString(createSSRApp(MidiPanel).use(pinia));
    expect(pressed).toMatch(/<dd\b[^>]*>C4 · E4 · F♯4<\/dd>/);
    for (const pitch of [60, 64, 66]) {
      input.onmidimessage!({ data: new Uint8Array([0x80, pitch, 0]) });
    }
    const released = await renderToString(createSSRApp(MidiPanel).use(pinia));
    expect(released).toMatch(/<dd\b[^>]*>—<\/dd>/);
  } finally {
    midi.$dispose();
  }
});

test('an empty device list shows its status, and errors retain the connect action', async () => {
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  midi.ready = true;
  const empty = await renderToString(createSSRApp(MidiPanel).use(pinia));
  expect(empty).toContain('No device');
  midi.ready = false;
  midi.error = 'MIDI permission denied.';
  const denied = await renderToString(createSSRApp(MidiPanel).use(pinia));
  expect(denied).toContain('MIDI permission denied.');
  expect(denied).toContain('Connect MIDI');
});

test('an unsupported browser explains why MIDI is unavailable and omits the connect action', async () => {
  vi.stubGlobal('navigator', {});
  const html = await renderToString(createSSRApp(MidiPanel).use(createPinia()));
  expect(html).toContain('Web MIDI is unavailable in this browser.');
  expect(html).not.toContain('Connect MIDI');
  expect(requestMIDIAccess).not.toHaveBeenCalled();
});
