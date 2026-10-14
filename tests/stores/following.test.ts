import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { createPinia } from 'pinia';
import { distantScore, practiceScore } from '../helpers/score';
import { mainPitches, ornamentPitches, ornamentScore } from '../helpers/ornaments';
import {
  FollowingSearch,
  type SearchRequest,
  type SearchResponse,
} from '../../src/following-search';
import { useFollowingStore } from '../../src/stores/following';
import { useMidiStore } from '../../src/stores/midi';
import { usePlaybackStore } from '../../src/stores/playback';
import { useScoreStore } from '../../src/stores/score';

let following: ReturnType<typeof useFollowingStore>;
let midi: ReturnType<typeof useMidiStore>;
let playback: ReturnType<typeof usePlaybackStore>;
let sheet: ReturnType<typeof useScoreStore>;
let worker: TestWorker;

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: { data: SearchResponse }) => void) | null = null;
  messages: SearchRequest[] = [];
  terminate = vi.fn();
  constructor() {
    TestWorker.instances.push(this);
  }
  postMessage(request: SearchRequest) {
    this.messages.push(structuredClone(request));
  }
  latest() {
    return this.messages.filter((message) => message.type === 'search').at(-1)!;
  }
  complete(request = this.latest()) {
    const init = this.messages
      .slice(0, this.messages.indexOf(request))
      .filter((message) => message.type === 'init')
      .at(-1)!;
    const iterator = new FollowingSearch(init.reference).search(request.pitches);
    let step = iterator.next();
    while (!step.done) step = iterator.next();
    this.onmessage?.({
      data: { generation: request.generation, id: request.id, candidates: step.value },
    });
  }
}
let input: {
  id: string;
  type: string;
  name: string;
  state: string;
  onmidimessage: ((event: { data: Uint8Array }) => void) | null;
  close: () => Promise<void>;
};

function message(pitch: number, status = 0x90, velocity = 100) {
  input.onmidimessage!({ data: new Uint8Array([status, pitch, velocity]) });
}

test('a paused opening lead-in keeps following in the first bar', () => {
  playback.currentTick = -1;
  expect(following.bar?.number).toBe(1);
  message(60);
  expect(following.result?.tick).toBe(0);
  expect(playback.currentTick).toBe(0);
});

beforeEach(async () => {
  TestWorker.instances.length = 0;
  vi.stubGlobal('Worker', TestWorker);
  input = {
    id: 'keyboard',
    type: 'input',
    name: 'Keyboard',
    state: 'connected',
    onmidimessage: null,
    close: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', {
    requestMIDIAccess: vi.fn().mockResolvedValue({ inputs: new Map([[input.id, input]]) }),
  });
  const pinia = createPinia();
  sheet = useScoreStore(pinia);
  sheet.load(
    practiceScore([[60], [62], [64], [65]], [[67], [69], [71], [72]], [[74], [76], [77], [79]]),
  );
  playback = usePlaybackStore(pinia);
  midi = useMidiStore(pinia);
  following = useFollowingStore(pinia);
  worker = TestWorker.instances[0]!;
  await midi.connect();
});

afterEach(() => {
  following.$dispose();
  playback.stop();
  playback.$dispose();
  midi.$dispose();
  sheet.$dispose();
  vi.unstubAllGlobals();
});

test('USB MIDI attacks update the shared playhead and explain a bar move', () => {
  for (const pitch of [60, 62, 64, 65, 67]) message(pitch);
  expect(playback.currentTick).toBe(4);
  expect(following.bar?.number).toBe(2);
  expect(following.result?.decision).toBe('advanced');
  expect(following.message).toContain('Moved to bar 2');
  expect(following.lastMovement).toMatchObject({ from: 1, to: 2, decision: 'advanced' });
  message(69);
  expect(playback.currentTick).toBe(5);
  expect(following.recentPitches).toEqual([60, 62, 64, 65, 67, 69]);
  expect(following.lastMovement?.reason).toContain('Moved to bar 2');
});

test('a partial retry moves within the same bar only after supporting notes', () => {
  for (const pitch of [60, 62, 64]) message(pitch);
  expect(playback.currentTick).toBe(2);
  message(60);
  expect(playback.currentTick).toBe(2);
  message(62);
  expect(playback.currentTick).toBe(1);
  expect(following.bar?.number).toBe(1);
  expect(following.result?.decision).toBe('restarted');
  const movement = following.lastMovement;
  expect(movement).toMatchObject({ from: 1, to: 1, decision: 'restarted' });
  message(64);
  expect(following.lastMovement).toBe(movement);
});

test('repeated attacks are processed synchronously, including multiple notes in one JS turn', () => {
  sheet.load({
    ...sheet.score!,
    notes: [60, 60, 62, 64].map((pitch, at) => ({ pitch, at, len: 1, groups: [] })),
  });
  message(60);
  message(60);
  expect(midi.pressedPitches).toEqual([60]);
  expect(playback.currentTick).toBe(1);
  expect(following.recentPitches).toEqual([60, 60]);
});

test('a retry confirmed after an ambiguous rewind still records the confirmed movement', () => {
  sheet.load({
    ...sheet.score!,
    notes: [60, 62, 64, 65, 60, 62, 69, 71].map((pitch, at) => ({
      pitch,
      at,
      len: 1,
      groups: [],
    })),
  });
  for (const pitch of [60, 62, 64, 65, 60, 62]) message(pitch);
  expect(following.result?.decision).toBe('ambiguous');
  expect(following.lastMovement).toBeNull();
  message(64);
  expect(following.result?.decision).toBe('restarted');
  expect(following.lastMovement).toMatchObject({ from: 1, to: 1, decision: 'restarted' });
});

test('note releases, zero-velocity note-ons, and pedal messages do not count as attacks', () => {
  message(60);
  const result = following.result;
  message(60, 0x80);
  message(62, 0x90, 0);
  message(64, 0xb0, 127);
  expect(following.result).toBe(result);
  expect(following.recentPitches).toEqual([60]);
});

test('manual seeking resets history and establishes a new anchor, even at the same tick', () => {
  message(60);
  void playback.seek(0);
  expect(following.result).toBeNull();
  expect(following.recentPitches).toEqual([]);
  expect(following.lastMovement).toBeNull();
  void playback.seek(8);
  expect(following.bar?.number).toBe(3);
  message(74);
  message(76);
  expect(playback.currentTick).toBe(9);
  expect(following.recentPitches).toEqual([74, 76]);
});

test('audio owns the location while playing and MIDI starts fresh when playback pauses', () => {
  message(60);
  playback.status = 'playing';
  playback.currentTick = 4;
  message(74);
  message(76);
  expect(playback.currentTick).toBe(4);
  expect(following.result).toBeNull();
  expect(following.recentPitches).toEqual([]);
  expect(following.message).toContain('audio controls the playhead');
  playback.status = 'paused';
  message(67);
  message(69);
  expect(playback.currentTick).toBe(5);
  expect(following.recentPitches).toEqual([67, 69]);
});

test('following can be turned off without interrupting live pressed-key information', () => {
  message(60);
  following.enabled = false;
  message(62);
  expect(playback.currentTick).toBe(0);
  expect(midi.pressedPitches).toEqual([60, 62]);
  expect(following.result).toBeNull();
  expect(following.message).toBe('MIDI following is off.');
  following.enabled = true;
  message(60);
  message(62);
  expect(playback.currentTick).toBe(1);
});

test('disconnecting and changing the score clear stale matching evidence', async () => {
  message(60);
  midi.disconnect();
  expect(following.result).toBeNull();
  expect(following.message).toContain('Connect a MIDI keyboard');
  await midi.connect();
  message(60);
  sheet.load({
    ...sheet.score!,
    notes: [{ pitch: 80, at: 0, len: 4, groups: [] }],
  });
  expect(following.result).toBeNull();
  expect(following.recentPitches).toEqual([]);
  message(62);
  expect(playback.currentTick).toBe(0);
  expect(following.result?.decision).toBe('unmatched');
});

test('disposing the follower removes its MIDI subscription', () => {
  message(60);
  following.$dispose();
  message(62);
  expect(playback.currentTick).toBe(0);
  expect(midi.pressedPitches).toEqual([60, 62]);
  expect(worker.terminate).toHaveBeenCalledOnce();
});

test('distant suggestions are clickable below the automatic-jump threshold and retain the matched position', () => {
  sheet.load(distantScore);
  void playback.seek(2);
  for (const pitch of [48, 50]) message(pitch);
  worker.complete();
  expect(following.allowDistant).toBe(false);
  expect(playback.currentTick).toBe(2);
  const choice = following.suggestions.find((candidate) => candidate.bar === 5)!;
  expect(choice.at).toBe(17);
  following.jump(choice);
  expect(playback.currentTick).toBe(17);
  expect(following.returnPoint).toMatchObject({ tick: 2, bar: 1 });
  message(52);
  expect(playback.currentTick).toBe(18);
});

test('a return restores the exact origin after ordinary following and consumes the return point', () => {
  sheet.load(distantScore);
  void playback.seek(2);
  for (const pitch of [48, 50]) message(pitch);
  worker.complete();
  following.jump(following.suggestions.find((candidate) => candidate.bar === 5)!);
  for (const pitch of [52, 53, 55, 57]) message(pitch);
  expect(playback.currentTick).toBe(21);
  expect(following.returnPoint).toMatchObject({ tick: 2, bar: 1 });
  const pending = worker.latest();
  const options = [...following.options];
  following.goBack();
  expect(playback.currentTick).toBe(2);
  expect(following.returnPoint).toBeNull();
  expect(following.recentPitches).toEqual([]);
  expect(following.options).toEqual(options);
  worker.complete(pending);
  expect(playback.currentTick).toBe(2);
  expect(following.suggestions).toEqual([]);
  expect(following.options).toEqual(options);
});

test('automatic distant jumps require enabling the setting and create a return point', () => {
  sheet.load(distantScore);
  void playback.seek(2);
  for (const pitch of [48, 50, 52, 53, 55, 57]) message(pitch);
  worker.complete();
  expect(playback.currentTick).toBe(2);
  following.allowDistant = true;
  expect(playback.currentTick).toBe(21);
  expect(following.returnPoint).toMatchObject({ tick: 2, bar: 1 });
  expect(following.options[following.returnPoint!.index]).toBe(following.returnPoint!.candidate);
  expect(following.result?.decision).toBe('jumped');
});

test.each([{ pitches: mainPitches }, { pitches: ornamentPitches }])(
  'MIDI jumps preserve the main anchor with full or omitted ornaments: $pitches',
  ({ pitches }) => {
    sheet.load(ornamentScore());
    for (const pitch of pitches) message(pitch);
    expect(worker.latest().pitches).toEqual(pitches);
    worker.complete();
    expect(playback.currentTick).toBe(0);
    following.allowDistant = true;
    expect(playback.currentTick).toBe(10080);
    expect(following.bar?.number).toBe(6);
    expect(following.result?.decision).toBe('jumped');
  },
);

test('the latest selected jump replaces the return point', () => {
  sheet.load(distantScore);
  void playback.seek(2);
  for (const pitch of [48, 50]) message(pitch);
  worker.complete();
  following.jump(following.suggestions.find((candidate) => candidate.bar === 5)!);
  for (const pitch of [67, 69]) message(pitch);
  worker.complete();
  following.jump(following.suggestions.find((candidate) => candidate.bar === 2)!);
  expect(following.returnPoint).toMatchObject({ tick: 17, bar: 5 });
  following.goBack();
  expect(playback.currentTick).toBe(17);
});

test('late worker results cannot override a manual anchor or a newer input', () => {
  sheet.load(distantScore);
  following.allowDistant = true;
  for (const pitch of [48, 50, 52, 53, 55, 57]) message(pitch);
  const oldInput = worker.latest();
  message(59);
  worker.complete(oldInput);
  expect(playback.currentTick).toBe(0);
  expect(following.searching).toBe(true);
  worker.complete();
  expect(playback.currentTick).toBe(22);
  for (const pitch of [60, 62]) message(pitch);
  const oldAnchor = worker.latest();
  void playback.seek(8);
  worker.complete(oldAnchor);
  expect(playback.currentTick).toBe(8);
  expect(following.suggestions).toEqual([]);
});

test('changing the score invalidates suggestions and the saved return point', () => {
  sheet.load(distantScore);
  for (const pitch of [48, 50]) message(pitch);
  worker.complete();
  following.jump(following.suggestions.find((candidate) => candidate.bar === 5)!);
  message(52);
  const pending = worker.latest();
  sheet.load(practiceScore([[84]]));
  worker.complete(pending);
  expect(following.returnPoint).toBeNull();
  expect(following.suggestions).toEqual([]);
  expect(following.options).toEqual([]);
});

test('selecting an option preserves the row and returning restores the original option', () => {
  sheet.load(practiceScore(...Array.from({ length: 6 }, () => [[48], [50]])));
  for (const pitch of [48, 50]) message(pitch);
  worker.complete();
  const choices = [...following.options];
  expect(choices).toHaveLength(3);
  const origin = playback.currentTick;
  following.jump(choices[1]!);
  expect(following.returnPoint).toMatchObject({ tick: origin, bar: 1, index: 1 });
  expect(following.returnPoint!.candidate).toBe(choices[1]);
  expect(following.options).toEqual(choices);
  following.goBack();
  expect(playback.currentTick).toBe(origin);
  expect(following.returnPoint).toBeNull();
  expect(following.options).toEqual(choices);
});

test('new MIDI input refreshes the other options while retaining the return action', () => {
  sheet.load(practiceScore(...Array.from({ length: 5 }, () => [[48], [50]]), [[84], [86]]));
  for (const pitch of [48, 50]) message(pitch);
  worker.complete();
  const choice = following.options[1]!;
  following.jump(choice);
  const previous = following.returnPoint;
  for (const pitch of [84, 86]) message(pitch);
  worker.complete();
  expect(following.returnPoint).toBe(previous);
  expect(following.options).toContain(choice);
  expect(following.options.some((option) => option.bar === 6)).toBe(true);
  expect(following.options.length).toBeLessThanOrEqual(3);
});

test('nearby manually selected options also return to the exact previous position', () => {
  sheet.load(practiceScore(...Array.from({ length: 4 }, () => [[48], [50]])));
  for (const pitch of [48, 50]) message(pitch);
  worker.complete();
  const origin = playback.currentTick;
  const choice = following.options.find((option) => option.bar === 2)!;
  following.jump(choice);
  expect(playback.currentTick).toBe(choice.at);
  expect(following.returnPoint).toMatchObject({ tick: origin, bar: 1 });
  following.goBack();
  expect(playback.currentTick).toBe(origin);
  expect(following.returnPoint).toBeNull();
  expect(following.options).toContain(choice);
});
