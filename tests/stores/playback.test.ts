import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { createPinia } from 'pinia';
import { performedNotes } from '../../src/ornaments';
import type { Note } from '../../src/music';
import { usePlaybackStore } from '../../src/stores/playback';
import { useScoreStore } from '../../src/stores/score';
import { createScoreStore, createScore } from '../helpers/score';

class TestGain {
  events: { value: number; time: number }[] = [];
  gain = {
    setValueAtTime: (value: number, time: number) => this.events.push({ value, time }),
    linearRampToValueAtTime: (value: number, time: number) => this.events.push({ value, time }),
  };
  connect() {
    return this;
  }
}

class TestOscillator {
  type = '';
  frequency = { value: 0 };
  starts: number[] = [];
  finishes: number[] = [];
  connect(gain: TestGain) {
    return gain;
  }
  start(time: number) {
    this.starts.push(time);
  }
  stop(time: number) {
    this.finishes.push(time);
  }
}

const contexts: TestAudioContext[] = [];
class TestAudioContext {
  currentTime = 0;
  destination = {};
  oscillators: TestOscillator[] = [];
  gains: TestGain[] = [];
  closes = 0;
  constructor() {
    contexts.push(this);
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    this.closes++;
    return Promise.resolve();
  }
  createOscillator() {
    const oscillator = new TestOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createGain() {
    const gain = new TestGain();
    this.gains.push(gain);
    return gain;
  }
}

const frames = new Map<number, FrameRequestCallback>();
let playback: ReturnType<typeof usePlaybackStore>;
let sheet: ReturnType<typeof useScoreStore>;
beforeEach(() => {
  contexts.length = 0;
  frames.clear();
  let frameId = 0;
  vi.stubGlobal('AudioContext', TestAudioContext);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const pinia = createPinia();
  sheet = createScoreStore(pinia, createScore());
  playback = usePlaybackStore(pinia);
});
afterEach(() => {
  playback.stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function advance(context: TestAudioContext, time: number) {
  context.currentTime = time;
  const callbacks = [...frames.values()];
  frames.clear();
  for (const callback of callbacks) callback(time * 1000);
}

function play(notes: Note[], from: number, to: number) {
  return playback.play(performedNotes({ ...sheet.score!, notes }), from, to);
}

test('opening ornaments get a lead-in and resume from inside it without restarting', async () => {
  const notes: Note[] = [
    {
      pitch: 60,
      at: 0,
      len: 480,
      groups: ['rh'],
      ornament: { timing: 'beforeStart', pitches: [59, 62], len: 120 },
    },
    { pitch: 48, at: 0, len: 480, groups: ['lh'] },
  ];
  await play(notes, 0, 480);
  const context = contexts[0]!;
  expect(playback.currentTick).toBe(-120);
  expect(context.oscillators.map((note) => note.starts[0])).toEqual([0.03, 0.155, 0.28, 0.28]);
  context.currentTime = 0.2175;
  playback.pause();
  expect(playback.currentTick).toBeCloseTo(-30);
  await playback.resume();
  const resumed = contexts[1]!;
  expect(resumed.oscillators).toHaveLength(3);
  expect(resumed.oscillators[0]!.frequency.value).toBeCloseTo(293.665);
  expect(resumed.oscillators[0]!.starts[0]).toBeCloseTo(0.03);
  expect(resumed.oscillators[1]!.starts[0]).toBeCloseTo(0.0925);
  expect(resumed.oscillators[2]!.starts[0]).toBeCloseTo(0.0925);
  advance(resumed, 0.0925);
  expect(playback.currentTick).toBeCloseTo(0);
});

test('seeking to an ornament owner includes its lead-in, also while paused', async () => {
  sheet.load(
    createScore({
      notes: [
        { pitch: 60, at: 480, len: 480, groups: ['rh'] },
        {
          pitch: 64,
          at: 960,
          len: 480,
          groups: ['rh'],
          ornament: { timing: 'beforeStart', pitches: [62], len: 120 },
        },
      ],
    }),
  );
  await playback.play(sheet.notes, 0, 1440);
  await playback.seek(960);
  expect(playback.currentTick).toBe(840);
  expect(contexts.at(-1)!.oscillators).toHaveLength(2);
  expect(contexts.at(-1)!.oscillators[1]!.starts[0]).toBeCloseTo(0.28);
  playback.pause();
  await playback.seek(960);
  expect(playback.currentTick).toBe(960);
  await playback.resume();
  expect(playback.currentTick).toBe(840);
});

const held: Note = { pitch: 60, at: 0, len: 1920, groups: ['rh', '1'] };

test('timed grace notes sound in sequence before their principal note', async () => {
  const notes: Note[] = [
    {
      pitch: 69,
      at: 0,
      len: 480,
      groups: ['rh'],
      ornament: { timing: 'atStart', pitches: [65], len: 30 },
    },
  ];
  await play(notes, 0, 480);
  const context = contexts[0]!;
  expect(context.oscillators).toHaveLength(2);
  expect(context.oscillators[0]!.frequency.value).toBeCloseTo(349.228);
  expect(context.oscillators[0]!.starts[0]).toBeCloseTo(0.03);
  expect(context.oscillators[0]!.finishes[0]).toBeCloseTo(0.0925);
  expect(context.oscillators[1]!.frequency.value).toBe(440);
  expect(context.oscillators[1]!.starts[0]).toBeCloseTo(0.0925);
  expect(context.oscillators[1]!.finishes[0]).toBeCloseTo(1.03);
});

test('playback from a moved playhead clips held notes and excludes notes outside the interval', async () => {
  await play(
    [
      { pitch: 60, at: 0, len: 480, groups: ['rh', '1'] },
      { pitch: 64, at: 0, len: 960, groups: ['lh', '2'] },
      { pitch: 67, at: 720, len: 480, groups: ['lh', '3'] },
      { pitch: 72, at: 1440, len: 480, groups: ['rh', '1'] },
    ],
    480,
    1440,
  );
  const context = contexts[0]!;
  expect(playback.playing).toBe(true);
  expect(playback.currentTick).toBe(480);
  expect(context.oscillators).toHaveLength(2);
  expect(context.oscillators[0]!.starts[0]).toBeCloseTo(0.03);
  expect(context.oscillators[0]!.finishes[0]).toBeCloseTo(1.03);
  expect(context.oscillators[1]!.starts[0]).toBeCloseTo(0.53);
  expect(context.oscillators[1]!.finishes[0]).toBeCloseTo(1.53);
  advance(context, 0.78);
  expect(playback.currentTick).toBeCloseTo(840);
});

test('pause reads the audio clock exactly and resume continues held notes at the chosen tempo', async () => {
  await play([held], 0, 1920);
  contexts[0]!.currentTime = 0.655;
  playback.pause();
  expect(playback.currentTick).toBeCloseTo(300);
  expect(playback.paused).toBe(true);
  expect(playback.playing).toBe(false);
  expect(contexts[0]!.closes).toBe(1);
  expect(frames.size).toBe(0);
  playback.bpm = 120;
  await playback.resume();
  const resumed = contexts[1]!;
  expect(playback.currentTick).toBeCloseTo(300);
  expect(playback.playing).toBe(true);
  expect(resumed.oscillators).toHaveLength(1);
  expect(resumed.oscillators[0]!.starts[0]).toBeCloseTo(0.03);
  expect(resumed.oscillators[0]!.finishes[0]).toBeCloseTo(1.7175);
  advance(resumed, 0.53);
  expect(playback.currentTick).toBeCloseTo(780);
  expect(held.len).toBe(1920);
});

test('stop clears paused playback and resets the playhead to the beginning', async () => {
  await play([held], 0, 1920);
  contexts[0]!.currentTime = 0.53;
  playback.pause();
  playback.stop();
  expect(playback.currentTick).toBe(0);
  expect(playback.status).toBe('stopped');
  await playback.resume();
  expect(contexts).toHaveLength(1);
});

test('natural completion leaves the playhead at the end and releases audio', async () => {
  await play([held], 0, 1920);
  advance(contexts[0]!, 4.1);
  expect(playback.currentTick).toBe(1920);
  expect(playback.status).toBe('stopped');
  expect(contexts[0]!.closes).toBe(1);
  expect(frames.size).toBe(0);
});

test('seeking during playback replaces the old schedule and continues the piece from the new position', async () => {
  sheet.load(createScore({ notes: [held, { pitch: 67, at: 1920, len: 480, groups: [] }] }));
  await play([held], 0, 1920);
  await playback.seek(480);
  expect(contexts[0]!.closes).toBe(1);
  expect(contexts).toHaveLength(2);
  expect(playback.playing).toBe(true);
  expect(playback.currentTick).toBe(480);
  const context = contexts[1]!;
  expect(context.oscillators).toHaveLength(2);
  for (const oscillator of context.oscillators) {
    expect(oscillator.starts[0]).toBeGreaterThanOrEqual(0.03);
    expect(oscillator.finishes[0]).toBeGreaterThan(oscillator.starts[0]!);
  }
  await playback.seek(0);
  expect(playback.currentTick).toBe(0);
  expect(playback.playing).toBe(true);
});

test('seeking while paused preserves pause and resumes from the new position', async () => {
  sheet.load(createScore({ notes: [held, { pitch: 67, at: 1920, len: 480, groups: [] }] }));
  await play([held], 0, 1920);
  playback.pause();
  await playback.seek(1920);
  expect(playback.currentTick).toBe(1920);
  expect(playback.paused).toBe(true);
  expect(contexts).toHaveLength(1);
  await playback.seek(0);
  expect(playback.currentTick).toBe(0);
  expect(playback.paused).toBe(true);
  expect(contexts).toHaveLength(1);
  await playback.resume();
  expect(playback.currentTick).toBe(0);
  expect(playback.playing).toBe(true);
  expect(contexts).toHaveLength(2);
});

test('seeking while stopped is silent and clamps the playhead to the piece bounds', async () => {
  sheet.load(createScore({ notes: [held] }));
  await playback.seek(960);
  expect(playback.currentTick).toBe(960);
  expect(playback.status).toBe('stopped');
  expect(contexts).toHaveLength(0);
  await playback.seek(-120);
  expect(playback.currentTick).toBe(0);
  expect(playback.status).toBe('stopped');
  await playback.seek(sheet.totalTicks + 120);
  expect(playback.currentTick).toBe(sheet.totalTicks);
});

test('pausing during audio startup prevents a stale resume from scheduling notes', async () => {
  let ready!: () => void;
  vi.spyOn(TestAudioContext.prototype, 'resume').mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
  );
  const starting = play([held], 0, 1920);
  playback.pause();
  ready();
  await starting;
  expect(playback.paused).toBe(true);
  expect(contexts[0]!.oscillators).toHaveLength(0);
  expect(frames.size).toBe(0);
});

test('resuming near a note end keeps short gain envelopes within the sounding interval', async () => {
  const note = { ...held, len: 480 };
  await play([note], 0, 480);
  contexts[0]!.currentTime = 1.028;
  playback.pause();
  await playback.resume();
  const context = contexts[1]!;
  const oscillator = context.oscillators[0]!;
  const times = context.gains[0]!.events.map((event) => event.time);
  expect(times).toEqual([...times].sort((a, b) => a - b));
  expect(times[0]).toBeGreaterThanOrEqual(oscillator.starts[0]!);
  expect(times.at(-1)).toBeLessThanOrEqual(oscillator.finishes[0]!);
});

test('loading another score resets active and paused playback and uses the new timing', async () => {
  for (const paused of [false, true]) {
    await play([held], 0, 1920);
    const previous = contexts.at(-1)!;
    advance(previous, 0.53);
    if (paused) playback.pause();
    sheet.selection = { kind: 'notes', indices: [0] };
    sheet.load(
      createScore({
        ppq: 240,
        tempos: [{ at: 0, bpm: 120 }],
        meters: [{ at: 0, meter: '3/4' }],
        notes: [{ pitch: 72, at: 0, len: 720, groups: ['rh', '1'] }],
      }),
    );
    expect(playback.status).toBe('stopped');
    expect(playback.currentTick).toBe(0);
    expect(playback.bpm).toBe(120);
    expect(previous.closes).toBe(1);
    expect(frames.size).toBe(0);
    expect(sheet.selectedNotes).toEqual([]);
    const count = contexts.length;
    await playback.resume();
    expect(contexts).toHaveLength(count);
    await play(sheet.score!.notes, 0, sheet.totalTicks);
    const context = contexts.at(-1)!;
    expect(context.oscillators).toHaveLength(1);
    expect(context.oscillators[0]!.frequency.value).toBeCloseTo(523.251);
    expect(context.oscillators[0]!.finishes[0]).toBeCloseTo(1.53);
    advance(context, 0.53);
    expect(playback.currentTick).toBeCloseTo(240);
    await playback.seek(5000);
    expect(playback.currentTick).toBe(720);
    expect(playback.status).toBe('stopped');
  }
});

test('loading a score during audio startup prevents the old piece from being scheduled', async () => {
  let ready!: () => void;
  vi.spyOn(TestAudioContext.prototype, 'resume').mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
  );
  const starting = play([held], 0, 1920);
  sheet.load(
    createScore({
      tempos: [{ at: 0, bpm: 90 }],

      notes: [{ ...held, pitch: 72, len: 480 }],
    }),
  );
  ready();
  await starting;
  expect(playback.status).toBe('stopped');
  expect(playback.currentTick).toBe(0);
  expect(playback.bpm).toBe(90);
  expect(contexts[0]!.closes).toBe(1);
  expect(contexts[0]!.oscillators).toHaveLength(0);
  expect(frames.size).toBe(0);
});

test('held notes and the playhead follow tempo changes, including pause and resume', async () => {
  sheet.load(
    createScore({
      tempos: [
        { at: 0, bpm: 60 },
        { at: 960, bpm: 120 },
      ],
      notes: [held],
    }),
  );
  await play([held], 0, 1920);
  const context = contexts[0]!;
  expect(context.oscillators[0]!.finishes[0]).toBeCloseTo(3.03);
  advance(context, 2.53);
  expect(playback.currentTick).toBeCloseTo(1440);
  playback.pause();
  playback.bpm = 120;
  await playback.resume();
  const resumed = contexts[1]!;
  expect(resumed.oscillators[0]!.finishes[0]).toBeCloseTo(0.28);
  advance(resumed, 0.155);
  expect(playback.currentTick).toBeCloseTo(1680);
});
