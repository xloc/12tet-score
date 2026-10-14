import { expect, test } from 'vite-plus/test';
import { matchStats, ScoreFollower } from '../src/following';
import { automaticLocation, FollowingSearch } from '../src/following-search';
import { createScore } from './helpers/score';
import { mainPitches, ornamentPitches, ornamentScore } from './helpers/ornaments';

function search(score = ornamentScore(), pitches = ornamentPitches) {
  const iterator = new FollowingSearch(new ScoreFollower(score).reference).search(pitches);
  let result = iterator.next();
  while (!result.done) result = iterator.next();
  return result.value;
}

test('two decorated tones in the same hand retain separate ornament ownership', () => {
  const score = createScore({
    notes: [
      {
        pitch: 60,
        at: 0,
        len: 480,
        groups: ['rh'],
        ornament: { timing: 'atStart', pitches: [59], len: 30 },
      },
      {
        pitch: 64,
        at: 0,
        len: 480,
        groups: ['rh'],
        ornament: { timing: 'atStart', pitches: [65], len: 30 },
      },
      { pitch: 67, at: 480, len: 480, groups: ['rh'] },
    ],
  });
  const reference = new ScoreFollower(score).reference.events[0]!;
  expect(reference.grace).toEqual([
    { notes: [[59]], main: [60], before: true },
    { notes: [[65]], main: [64], before: true },
  ]);
  for (const pitches of [
    [59, 65, 64, 60, 67],
    [60, 64, 67],
  ]) {
    const follower = new ScoreFollower(score);
    const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
    expect(matchStats(result.candidates[0]!)).toMatchObject({ matches: 3, missed: 0, extra: 0 });
    expect(result.tick).toBe(480);
  }
});

test.each([{ pitches: mainPitches }, { pitches: ornamentPitches }])(
  'local following accepts full or omitted ornaments: $pitches',
  ({ pitches }) => {
    const follower = new ScoreFollower(ornamentScore(), 7680);
    const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
    expect(result.tick).toBe(10080);
    expect(result.candidates[0]!.cost).toBe(0);
    expect(matchStats(result.candidates[0]!)).toMatchObject({
      matches: 6,
      extra: 0,
      missed: 0,
      onsets: 6,
      score: 1,
    });
  },
);

test.each([{ pitches: mainPitches }, { pitches: ornamentPitches }])(
  'whole-score jumps use the same main-note evidence: $pitches',
  ({ pitches }) => {
    const candidates = search(ornamentScore(), pitches);
    expect(candidates[0]).toMatchObject({ bar: 6, at: 10080 });
    expect(matchStats(candidates[0]!)).toMatchObject({
      matches: 6,
      extra: 0,
      missed: 0,
      onsets: 6,
      score: 1,
    });
    expect(automaticLocation(candidates, 1, true)?.at).toBe(10080);
  },
);

test('a pre-beat grace group belongs to its principal bar and does not create a jump anchor', () => {
  const score = createScore({
    duration: 2880,
    notes: [
      { pitch: 60, at: 0, len: 480, groups: ['rh'] },
      { pitch: 62, at: 480, len: 480, groups: ['rh'] },
      {
        pitch: 72,
        at: 1920,
        len: 480,
        groups: ['rh'],
        ornament: { timing: 'beforeStart', pitches: [76, 74], len: 60 },
      },
      { pitch: 69, at: 2400, len: 480, groups: ['rh'] },
    ],
  });
  const follower = new ScoreFollower(score, 1920);
  expect(follower.reference.events.map(({ at, bar }) => [at, bar])).toEqual([
    [0, 0],
    [480, 0],
    [1920, 1],
    [2400, 1],
  ]);
  expect(follower.receive(76).tick).toBeUndefined();
  expect(follower.receive(74).tick).toBeUndefined();
  expect(follower.receive(72).tick).toBe(1920);
  expect(follower.receive(69).tick).toBe(2400);
  const best = search(score, [76, 74, 72, 69])[0]!;
  expect(best.bar).toBe(2);
  expect(matchStats(best)).toMatchObject({ matches: 2, extra: 0, missed: 0 });
});

test('ordinary chord pitches can arrive before, during, or after the grace sequence', () => {
  const score = ornamentScore();
  score.notes.push({ pitch: 48, at: 7680, len: 480, groups: ['lh'] });
  for (const pitches of [
    [48, 60, 59, 60, 64],
    [60, 48, 59, 60, 64],
    [60, 59, 48, 60, 64],
    [60, 59, 60, 48, 64],
  ]) {
    const follower = new ScoreFollower(score, 7680);
    const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
    expect(result.tick).toBe(8160);
    expect(matchStats(result.candidates[0]!)).toMatchObject({
      matches: 3,
      extra: 0,
      missed: 0,
      onsets: 2,
    });
  }
});

test('an ornament belongs only to its decorated tone within a same-hand chord', () => {
  const score = ornamentScore();
  score.notes.push(
    { pitch: 72, at: 7680, len: 480, groups: ['rh'] },
    { pitch: 76, at: 7680, len: 480, groups: ['rh'] },
  );
  expect(new ScoreFollower(score).reference.events[4]!.grace![0]!.main).toEqual([60]);
  for (const pitches of [
    [72, 76, 60, 59, 60, 64],
    [60, 72, 59, 76, 60, 64],
    [60, 59, 60, 76, 72, 64],
  ]) {
    const follower = new ScoreFollower(score, 7680);
    const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
    expect(result.tick).toBe(8160);
    expect(matchStats(result.candidates[0]!)).toMatchObject({
      matches: 4,
      extra: 0,
      missed: 0,
      onsets: 2,
    });
  }
});

test('a partial grace sequence is optional and unrelated wrong notes remain errors', () => {
  const follower = new ScoreFollower(ornamentScore(), 7680);
  const result = [59, 60, 64, 90, 67].map((pitch) => follower.receive(pitch)).at(-1)!;
  expect(result.tick).toBe(8640);
  expect(matchStats(result.candidates[0]!)).toMatchObject({ matches: 3, extra: 1, missed: 0 });
  expect(result.candidates[0]!.evidence.find((item) => item.pitch === 90)?.kind).toBe('extra');
});

test('a grace pitch belonging to a distant onset is still extra at the current position', () => {
  const follower = new ScoreFollower(ornamentScore(), 7680);
  const result = [60, 72, 64].map((pitch) => follower.receive(pitch)).at(-1)!;
  expect(result.tick).toBe(8160);
  expect(matchStats(result.candidates[0]!)).toMatchObject({ matches: 2, extra: 1, missed: 0 });
});

test('skipping an ordinary note still reduces jump confidence', () => {
  const candidates = search(ornamentScore(), [60, 67, 62, 69, 71]);
  expect(matchStats(candidates[0]!)).toMatchObject({ matches: 5, extra: 0, missed: 1 });
  expect(automaticLocation(candidates, 1, true)).toBeUndefined();
});

test.each([{ pitches: [60, 60, 64] }, { pitches: [60, 59, 60, 60, 64] }])(
  'ordinary repeated attacks remain independent after an ornament: $pitches',
  ({ pitches }) => {
    const score = createScore({
      notes: [
        {
          pitch: 60,
          at: 0,
          len: 480,
          groups: ['rh'],
          ornament: { timing: 'atStart', pitches: [60, 59], len: 60 },
        },
        { pitch: 60, at: 480, len: 480, groups: ['rh'] },
        { pitch: 64, at: 960, len: 480, groups: ['rh'] },
      ],
    });
    const follower = new ScoreFollower(score);
    const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
    expect(result.tick).toBe(960);
    expect(matchStats(result.candidates[0]!)).toMatchObject({
      matches: 3,
      extra: 0,
      missed: 0,
      onsets: 3,
    });
  },
);

test('simultaneous grace chords accept either key order', () => {
  const score = createScore({
    notes: [
      {
        pitch: 60,
        at: 0,
        len: 480,
        groups: ['rh'],
        ornament: { timing: 'atStart', pitches: [[59, 62]], len: 30 },
      },
      { pitch: 64, at: 480, len: 480, groups: ['rh'] },
    ],
  });
  for (const pitches of [
    [59, 62, 60, 64],
    [62, 59, 60, 64],
  ]) {
    const follower = new ScoreFollower(score);
    const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
    expect(result.tick).toBe(480);
    expect(matchStats(result.candidates[0]!)).toMatchObject({ matches: 2, extra: 0, missed: 0 });
  }
});

test('two hands can interleave their own quick sequences at the same main onset', () => {
  const score = createScore({
    notes: [
      {
        pitch: 60,
        at: 0,
        len: 480,
        groups: ['rh'],
        ornament: { timing: 'atStart', pitches: [60, 59], len: 60 },
      },
      {
        pitch: 48,
        at: 0,
        len: 480,
        groups: ['lh'],
        ornament: { timing: 'atStart', pitches: [48, 47], len: 60 },
      },
      { pitch: 64, at: 480, len: 480, groups: ['rh'] },
      { pitch: 52, at: 480, len: 480, groups: ['lh'] },
    ],
  });
  for (const pitches of [
    [48, 60, 47, 59, 60, 48, 52, 64],
    [60, 59, 48, 60, 47, 48, 64, 52],
  ]) {
    const follower = new ScoreFollower(score);
    const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
    expect(result.tick).toBe(480);
    expect(matchStats(result.candidates[0]!)).toMatchObject({
      matches: 4,
      extra: 0,
      missed: 0,
      onsets: 2,
    });
  }
});

test('quick events after a held main note remain optional at that same anchor', () => {
  const score = createScore({
    notes: [
      {
        pitch: 60,
        at: 0,
        len: 480,
        groups: ['rh'],
        ornament: {
          timing: 'beforeEnd',
          pitches: [62, 60, 59, 60],
          len: 180,
          rhythm: [1, 1, 1, 3],
        },
      },
      { pitch: 64, at: 480, len: 480, groups: ['rh'] },
    ],
  });
  for (const pitches of [
    [60, 64],
    [60, 62, 60, 59, 60, 64],
  ]) {
    const follower = new ScoreFollower(score);
    const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
    expect(result.tick).toBe(480);
    expect(matchStats(result.candidates[0]!)).toMatchObject({ matches: 2, extra: 0, missed: 0 });
  }
});

test('a delayed turn stays optional when the other hand advances during its held main note', () => {
  const score = createScore({
    notes: [
      {
        pitch: 70,
        at: 0,
        len: 480,
        groups: ['rh'],
        ornament: { timing: 'beforeEnd', pitches: [71, 70, 69, 70], len: 120 },
      },
      { pitch: 52, at: 0, len: 240, groups: ['lh'] },
      { pitch: 52, at: 240, len: 240, groups: ['lh'] },
      { pitch: 79, at: 480, len: 480, groups: ['rh'] },
      { pitch: 49, at: 480, len: 240, groups: ['lh'] },
    ],
  });
  for (const pitches of [
    [70, 52, 52, 79, 49],
    [70, 52, 52, 71, 70, 69, 70, 79, 49],
  ]) {
    const follower = new ScoreFollower(score);
    const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
    expect(result.tick).toBe(480);
    for (const best of [result.candidates[0]!, search(score, pitches)[0]!]) {
      expect(matchStats(best)).toMatchObject({ matches: 5, extra: 0, missed: 0, onsets: 3 });
    }
    const pastTurn = follower.receive(71);
    const continuing = pastTurn.candidates.find((candidate) => candidate.mode === 'continue')!;
    expect(pastTurn.tick).toBeUndefined();
    expect(matchStats(continuing)).toMatchObject({
      matches: 5,
      extra: 1,
      missed: 0,
    });
  }
});

test('optional history does not retain stale main-note evidence beyond the window', () => {
  const score = ornamentScore();
  const later = Array.from({ length: 12 }, (_, index) => 73 + index);
  score.duration = 16320;
  score.notes.push(
    ...later.map((pitch, index) => ({ pitch, at: 10560 + index * 480, len: 480, groups: ['rh'] })),
  );
  const follower = new ScoreFollower(score, 7680);
  const result = [...ornamentPitches, ...later].map((pitch) => follower.receive(pitch)).at(-1)!;
  expect(result.tick).toBe(15840);
  expect(
    result.candidates[0]!.evidence.filter((item) => item.kind === 'match').map(
      (item) => item.pitch,
    ),
  ).toEqual(later);
  expect(matchStats(result.candidates[0]!)).toMatchObject({ matches: 12, extra: 0, missed: 0 });
});

test('one ornament cannot supply multiple main-note positions for a jump', () => {
  const score = ornamentScore();
  for (const pitches of [
    [60, 59, 60],
    [64, 62, 60, 62],
  ]) {
    const candidates = search(score, pitches);
    expect(automaticLocation(candidates, 1, true)).toBeUndefined();
    expect(automaticLocation(candidates, 4, false)).toBeUndefined();
  }
});

test('an optional prefix for the same upcoming anchor does not veto a supported distant jump', () => {
  const score = ornamentScore();
  score.notes.push(
    { pitch: 48, at: 9120, len: 480, groups: ['lh'] },
    { pitch: 52, at: 9120, len: 480, groups: ['lh'] },
  );
  const candidates = search(score, [60, 64, 67, 48, 52, 62, 69]);
  expect(matchStats(candidates[0]!)).toMatchObject({ matches: 7, extra: 0, missed: 0 });
  expect(automaticLocation(candidates, 1, true)?.at).toBe(9600);
});

test('choosing a search candidate preserves optional-note progress for continued following', () => {
  const score = ornamentScore();
  const candidate = search(score, [60, 59, 60, 64, 65, 64, 67])[0]!;
  const follower = new ScoreFollower(score);
  follower.choose(candidate);
  const result = [65, 67, 64, 62, 60, 62].map((pitch) => follower.receive(pitch)).at(-1)!;
  expect(result.tick).toBe(9120);
  expect(matchStats(result.candidates[0]!)).toMatchObject({ extra: 0, missed: 0 });
});
