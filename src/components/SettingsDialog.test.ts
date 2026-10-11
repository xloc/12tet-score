import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia } from 'pinia';
import { useMidiStore } from '../stores/midi';
import { usePlaybackStore } from '../stores/playback';
import { createScoreStore, score } from '../test/score';
import SettingsDialog from './SettingsDialog.vue';

const requestMIDIAccess = vi.fn();
const requestDevice = vi.fn();

beforeEach(() => {
  requestMIDIAccess.mockReset();
  requestDevice.mockReset();
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { requestMIDIAccess, bluetooth: { requestDevice } });
});

afterEach(() => vi.unstubAllGlobals());

async function action(pinia: ReturnType<typeof createPinia>, title: string) {
  const actions = new Map<string, () => unknown>();
  const app = createSSRApp(SettingsDialog).use(pinia);
  app.mixin({
    created() {
      const { title, onClick } = this.$attrs;
      if (typeof title === 'string' && typeof onClick === 'function') {
        actions.set(title, () => onClick());
      }
    },
  });
  await renderToString(app);
  await actions.get(title)!();
}

test('one dialog groups display, MIDI, and playback settings without requesting MIDI permission', async () => {
  const pinia = createPinia();
  createScoreStore(pinia);
  const html = await renderToString(createSSRApp(SettingsDialog).use(pinia));
  expect(html.match(/<dialog\b/g)).toHaveLength(1);
  expect(html).toMatch(/<dialog\b[^>]*closedby="any"/);
  expect([...html.matchAll(/<legend\b[^>]*>(.*?)<\/legend>/g)].map((match) => match[1])).toEqual([
    'Score display',
    'MIDI',
    'Playback',
  ]);
  expect(html).toContain('Connect MIDI');
  expect(html).toContain('Connect Bluetooth MIDI');
  expect(requestMIDIAccess).not.toHaveBeenCalled();
  expect(requestDevice).not.toHaveBeenCalled();
});

test('only playback speed is disabled while playing; display and MIDI remain usable', async () => {
  const pinia = createPinia();
  createScoreStore(pinia);
  const playback = usePlaybackStore(pinia);
  for (const status of ['playing', 'paused', 'stopped'] as const) {
    playback.status = status;
    const html = await renderToString(createSSRApp(SettingsDialog).use(pinia));
    const groups = html.match(/<fieldset\b[\s\S]*?<\/fieldset>/g)!;
    for (const group of groups.slice(0, 2)) expect(group).not.toMatch(/^<fieldset\b[^>]*disabled/);
    expect(/^<fieldset\b[^>]*disabled/.test(groups[2]!)).toBe(status === 'playing');
    expect(html.match(/<button\b[^>]*title="Connect MIDI"[^>]*>/)![0]).not.toMatch(
      /\sdisabled(?:\s|=|>)/,
    );
    expect(html.match(/<button\b[^>]*title="Connect Bluetooth MIDI"[^>]*>/)![0]).not.toMatch(
      /\sdisabled(?:\s|=|>)/,
    );
  }
});

test('display and MIDI settings remain available before a score loads', async () => {
  const html = await renderToString(createSSRApp(SettingsDialog).use(createPinia()));
  expect(html).toContain('id="fold-threshold"');
  expect(html).toContain('id="variable-bar-width"');
  expect(html).toContain('Connect MIDI');
  expect(html).not.toContain('id="tempo"');
});

test('playback speed displays its override separately from the score tempo', async () => {
  const pinia = createPinia();
  const sheet = createScoreStore(pinia);
  usePlaybackStore(pinia).bpm = 80;
  const html = await renderToString(createSSRApp(SettingsDialog).use(pinia));
  expect(html).toContain('Playback speed');
  expect(html.match(/<input\b[^>]*id="tempo"[^>]*>/)![0]).toContain('value="80"');
  expect(sheet.score!.tempos[0]!.bpm).toBe(score.tempos[0]!.bpm);
});

test('MIDI details list device states and the complete pressed-pitch list', async () => {
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  midi.ready = true;
  midi.inputs = {
    usb: {
      name: 'USB keyboard',
      state: 'connected',
      transport: 'midi',
      pressed: { 0: new Set([60, 64, 66, 67]) },
    },
    ble: { name: 'BLE keyboard', state: 'disconnected', transport: 'midi', pressed: {} },
    unnamed: { name: null, state: 'connected', transport: 'midi', pressed: {} },
  };
  const html = await renderToString(createSSRApp(SettingsDialog).use(pinia));
  expect(html).toContain('USB keyboard');
  expect(html).toMatch(/BLE keyboard[\s\S]*?Disconnected/);
  expect(html).toContain('Unnamed MIDI input');
  expect(html).toContain('C4 · E4 · F♯4 · G4');
  expect(html).toContain('Disconnect MIDI');
  expect(html).not.toContain('Connect MIDI');
});

test('pending MIDI permission disables only the connect action, and errors allow retry', async () => {
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  midi.connecting = true;
  const pending = await renderToString(createSSRApp(SettingsDialog).use(pinia));
  expect(pending).toContain('Connecting…');
  expect(pending).toMatch(/<button\b[^>]*title="Connect MIDI"[^>]*disabled/);
  expect(pending).not.toMatch(/<fieldset\b[^>]*disabled/);
  midi.connecting = false;
  midi.error = 'MIDI permission denied.';
  const denied = await renderToString(createSSRApp(SettingsDialog).use(pinia));
  expect(denied).toContain('MIDI permission denied.');
  expect(denied.match(/<button\b[^>]*title="Connect MIDI"[^>]*>/)![0]).not.toMatch(
    /\sdisabled(?:\s|=|>)/,
  );
});

test('unsupported MIDI is explained while the other settings remain available', async () => {
  vi.stubGlobal('navigator', {});
  const pinia = createPinia();
  createScoreStore(pinia);
  const html = await renderToString(createSSRApp(SettingsDialog).use(pinia));
  expect(html).toContain('Web MIDI is unavailable in this browser.');
  expect(html).not.toContain('Connect MIDI');
  expect(html).toContain('id="variable-bar-width"');
  expect(html).toContain('id="tempo"');
});

test('the unified dialog controls connect and disconnect MIDI', async () => {
  requestMIDIAccess.mockResolvedValue({ inputs: new Map(), onstatechange: null });
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  try {
    await action(pinia, 'Connect MIDI');
    expect(requestMIDIAccess).toHaveBeenCalledExactlyOnceWith({ sysex: false });
    expect(midi.ready).toBe(true);
    await action(pinia, 'Disconnect MIDI');
    expect(midi.ready).toBe(false);
  } finally {
    midi.$dispose();
  }
});

test('Bluetooth can be selected even when the browser has no System MIDI API', async () => {
  vi.stubGlobal('navigator', { bluetooth: { requestDevice } });
  const html = await renderToString(createSSRApp(SettingsDialog).use(createPinia()));
  expect(html).toContain('Web MIDI is unavailable in this browser.');
  expect(html).toContain('title="Connect Bluetooth MIDI"');
  expect(html).not.toContain('title="Connect MIDI"');
  expect(requestDevice).not.toHaveBeenCalled();
});

test('pending Bluetooth connection disables only its own control and errors keep retry available', async () => {
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  midi.bluetoothConnecting = true;
  const pending = await renderToString(createSSRApp(SettingsDialog).use(pinia));
  expect(pending).toMatch(/<button\b[^>]*title="Connect Bluetooth MIDI"[^>]*disabled/);
  expect(pending.match(/<button\b[^>]*title="Connect MIDI"[^>]*>/)![0]).not.toMatch(
    /\sdisabled(?:\s|=|>)/,
  );
  midi.bluetoothConnecting = false;
  midi.bluetoothError = 'Bluetooth permission denied.';
  const failed = await renderToString(createSSRApp(SettingsDialog).use(pinia));
  expect(failed).toContain('Bluetooth permission denied.');
  expect(failed.match(/<button\b[^>]*title="Connect Bluetooth MIDI"[^>]*>/)![0]).not.toMatch(
    /\sdisabled(?:\s|=|>)/,
  );
});

test('the Bluetooth action opens the picker and disconnects without requesting System MIDI', async () => {
  const characteristic = Object.assign(new EventTarget(), {
    properties: { read: false },
    startNotifications: vi.fn().mockResolvedValue(undefined),
  });
  const disconnect = vi.fn();
  requestDevice.mockResolvedValue(
    Object.assign(new EventTarget(), {
      id: 'keyboard',
      name: 'Bluetooth keyboard',
      gatt: {
        connect: vi.fn().mockResolvedValue({
          getPrimaryService: vi.fn().mockResolvedValue({
            getCharacteristic: vi.fn().mockResolvedValue(characteristic),
          }),
        }),
        disconnect,
      },
    }),
  );
  const pinia = createPinia();
  const midi = useMidiStore(pinia);
  try {
    await action(pinia, 'Connect Bluetooth MIDI');
    expect(requestDevice).toHaveBeenCalledOnce();
    expect(requestMIDIAccess).not.toHaveBeenCalled();
    expect(midi.bluetoothReady).toBe(true);
    const connected = await renderToString(createSSRApp(SettingsDialog).use(pinia));
    expect(connected).toContain('Bluetooth keyboard');
    expect(connected).toContain('title="Disconnect Bluetooth MIDI"');
    expect(connected).toContain('title="Connect MIDI"');
    await action(pinia, 'Disconnect Bluetooth MIDI');
    expect(disconnect).toHaveBeenCalledOnce();
    expect(midi.bluetoothReady).toBe(false);
  } finally {
    midi.$dispose();
  }
});
