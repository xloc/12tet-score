import { afterEach, expect, test, vi } from 'vite-plus/test';
import { createPinia } from 'pinia';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { pitchRows, type PitchRow } from '../../src/layout';
import { notationProps } from '../helpers/score';
import { useMidiStore } from '../../src/stores/midi';
import MidiPitchOverlay from '../../src/components/MidiPitchOverlay.vue';
import MusicNotation from '../../src/components/MusicNotation.vue';

afterEach(() => vi.unstubAllGlobals());

function renderOverlay(rows: PitchRow[], pitches: number[]) {
  return renderToString(createSSRApp(MidiPitchOverlay, { rows, pitches }));
}

function renderSheet(pitches: number[], playhead = 0, variableBarWidth = true) {
  return renderToString(
    createSSRApp(MusicNotation, {
      ...notationProps({
        notes: [0, 1920].flatMap((at) =>
          [60, 64, 72].map((pitch) => ({ pitch, at, len: 1920, groups: [] })),
        ),
        totalTicks: 3840,
        ppq: 480,
        meters: [{ at: 0, meter: '4/4' }],
        foldThreshold: 0,
        variableBarWidth,
        playhead,
        playing: false,
        selection: { kind: 'notes', indices: [] },
      }),
      pressedPitches: pitches,
    }),
  );
}

test('played pitches use exact octave rows, including pitches absent from the score notes', async () => {
  const rows = pitchRows([48, 72], 0);
  const html = await renderOverlay(rows, [48, 60, 72]);
  const lines = html.match(/<span\b[^>]*data-midi-line[^>]*>/g)!;
  expect(lines).toHaveLength(3);
  for (const [index, pitch] of [72, 60, 48].entries()) {
    expect(lines[index]).toContain(`data-midi-pitch="${pitch}"`);
    expect(lines[index]).toContain(`grid-row:${index * 12 + 1};grid-column:1 / -1`);
    expect(lines[index]).toContain('pointer-events-none');
    expect(lines[index]).toContain('z-15 h-px');
    expect(lines[index]).toContain('bg-lime-600');
  }
  expect(html).not.toContain('data-midi-hidden');
  expect(rows).toEqual(pitchRows([48, 72], 0));
});

test('folded and out-of-range keys get compact counts and exact-pitch tooltips without new rows', async () => {
  const rows = pitchRows([48, 72], 12);
  const html = await renderOverlay(rows, [36, 48, 60, 64, 72, 84]);
  expect(html.match(/data-midi-line/g)).toHaveLength(2);
  expect(html).toContain('data-midi-pitch="48"');
  expect(html).toContain('data-midi-pitch="72"');
  expect(html).not.toContain('data-midi-pitch="60"');
  expect(html).not.toContain('data-midi-pitch="64"');
  const hidden = html.match(/<span\b[^>]*data-midi-hidden[^>]*>[\s\S]*?<\/span>/g)!;
  expect(hidden).toHaveLength(3);
  expect(hidden[0]).toContain('data-midi-kind="above"');
  expect(hidden[0]).toContain('grid-row:1;');
  expect(hidden[0]).toContain('above the visible range: C6');
  expect(hidden[0]).toContain('↑1');
  expect(hidden[1]).toContain('data-midi-kind="folded"');
  expect(hidden[1]).toContain('grid-row:2;');
  expect(hidden[1]).toContain('in the folded gap: C4, E4');
  expect(hidden[1]).toContain('↕2');
  expect(hidden[2]).toContain('data-midi-kind="below"');
  expect(hidden[2]).toContain('grid-row:3;');
  expect(hidden[2]).toContain('below the visible range: C2');
  expect(hidden[2]).toContain('↓1');
  expect(rows).toEqual([72, { from: 49, to: 71 }, 48]);
  const unfolded = await renderOverlay(pitchRows([48, 72], 0), [60, 64]);
  expect(unfolded.match(/data-midi-line/g)).toHaveLength(2);
  expect(unfolded).not.toContain('data-midi-hidden');
});

test('a large held chord keeps hidden-pitch summaries compact', async () => {
  const html = await renderOverlay(
    [60],
    Array.from({ length: 128 }, (_, pitch) => pitch),
  );
  expect(html.match(/data-midi-line/g)).toHaveLength(1);
  expect(html.match(/data-midi-hidden/g)).toHaveLength(2);
  const hidden = html.match(/<span\b[^>]*data-midi-hidden[^>]*>([\s\S]*?)<\/span>/g)!;
  expect(hidden.map((marker) => marker.replace(/<[^>]*>/g, '').trim())).toEqual(['↑67', '↓60']);
});

test('live lines follow only the playhead bar while paused, across wrapping and variable bar widths', async () => {
  for (const variableBarWidth of [false, true]) {
    for (const [playhead, active] of [
      [0, 0],
      [1919, 0],
      [1920, 1],
      [3840, 1],
    ]) {
      const html = await renderSheet([60, 72], playhead, variableBarWidth);
      const bars = html.match(/<div\b[^>]*data-score-bar[^>]*>[\s\S]*?<\/div>/g)!;
      expect(bars).toHaveLength(2);
      expect(bars[active!]!.match(/data-midi-line/g)).toHaveLength(2);
      expect(bars[1 - active!]!).not.toContain('data-midi-overlay');
      expect(html.match(/data-midi-overlay/g)).toHaveLength(1);
      expect(html.match(/data-playhead/g)).toHaveLength(1);
      expect(html).toContain('z-10 h-1');
      expect(html).toContain('z-15 h-px');
      expect(html).toContain('z-20 w-px');
    }
  }
});

test('the sheet follows MIDI presses, releases, shared pitches, and disconnects', async () => {
  const usb = {
    id: 'usb',
    type: 'input',
    name: 'USB keyboard',
    state: 'connected' as MIDIPort['state'],
    onmidimessage: null as ((event: Pick<MIDIMessageEvent, 'data'>) => void) | null,
    close: vi.fn().mockResolvedValue(undefined),
  };
  const access = {
    inputs: new Map([[usb.id, usb]]),
    onstatechange: null as ((event: { port: typeof usb }) => void) | null,
  };
  vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn().mockResolvedValue(access) });
  const midi = useMidiStore(createPinia());
  try {
    await midi.connect();
    expect(await renderSheet(midi.pressedPitches)).not.toContain('data-midi-overlay');
    usb.onmidimessage!({ data: new Uint8Array([0x90, 60, 100]) });
    usb.onmidimessage!({ data: new Uint8Array([0x90, 64, 100]) });
    midi.inputs.ble = {
      name: 'Bluetooth keyboard',
      state: 'connected',
      transport: 'bluetooth',
      pressed: { 0: new Set([60]) },
    };
    const held = await renderSheet(midi.pressedPitches);
    expect(held.match(/data-midi-line/g)).toHaveLength(2);
    expect(held.match(/data-midi-pitch="60"/g)).toHaveLength(1);
    usb.onmidimessage!({ data: new Uint8Array([0x80, 60, 0]) });
    expect(await renderSheet(midi.pressedPitches)).toContain('data-midi-pitch="60"');
    midi.disconnectBluetooth();
    const released = await renderSheet(midi.pressedPitches);
    expect(released).not.toContain('data-midi-pitch="60"');
    expect(released).toContain('data-midi-pitch="64"');
    usb.onmidimessage!({ data: new Uint8Array([0x90, 64, 0]) });
    expect(await renderSheet(midi.pressedPitches)).not.toContain('data-midi-overlay');
    usb.onmidimessage!({ data: new Uint8Array([0x90, 72, 100]) });
    expect(await renderSheet(midi.pressedPitches)).toContain('data-midi-pitch="72"');
    usb.state = 'disconnected';
    access.onstatechange!({ port: usb });
    expect(await renderSheet(midi.pressedPitches)).not.toContain('data-midi-overlay');
  } finally {
    midi.$dispose();
  }
});
