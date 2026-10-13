import { expect, test } from 'vite-plus/test';
import { ScoreFollower } from './following';
import { practiceScore, score } from './test/score';

test('follows ordered attacks and advances on evidence for the next bar', () => {
  const follower = new ScoreFollower(practiceScore([[60], [62], [64], [65]], [[67], [69]]));
  expect([60, 62, 64, 65].map((pitch) => follower.receive(pitch).tick)).toEqual([0, 1, 2, 3]);
  const next = follower.receive(67);
  expect(next.decision).toBe('advanced');
  expect(next.tick).toBe(4);
  expect(follower.receive(69).tick).toBe(5);
});

test('recognizes an unfinished-bar retry after more than one supporting note', () => {
  const follower = new ScoreFollower(practiceScore([[60], [62], [64], [65]], [[67], [69]]));
  for (const pitch of [60, 62, 64]) follower.receive(pitch);
  const first = follower.receive(60);
  expect(first.decision).toBe('ambiguous');
  expect(first.tick).toBeUndefined();
  const retry = follower.receive(62);
  expect(retry.decision).toBe('restarted');
  expect(retry.tick).toBe(1);
  expect(retry.candidates[0]!.evidence.flatMap((item) => item.missed)).toEqual([]);
});

test('can return to either of the previous two bars after distinct supporting notes', () => {
  for (const [pitches, tick] of [
    [[60, 62], 1],
    [[64, 65], 5],
  ] as const) {
    const follower = new ScoreFollower(practiceScore([[60], [62]], [[64], [65]], [[67], [69]]), 8);
    follower.receive(67);
    expect(follower.receive(pitches[0]).tick).toBeUndefined();
    const returned = follower.receive(pitches[1]);
    expect(returned.decision).toBe('returned');
    expect(returned.tick).toBe(tick);
  }
});

test('choosing a matched location preserves attacks already assigned to its chord', () => {
  const follower = new ScoreFollower(practiceScore([[60], [62]], [[67, 69], [71]]));
  const candidate = follower.receive(67).candidates.find((item) => item.bar === 2)!;
  follower.choose(candidate);
  expect(follower.receive(69).tick).toBe(4);
  expect(follower.receive(71).tick).toBe(5);
});

test('identical bars favor a retry and never auto-advance from ambiguous pitches', () => {
  const follower = new ScoreFollower(practiceScore([[60], [62]], [[60], [62]]));
  for (let repetition = 0; repetition < 20; repetition++) {
    for (const pitch of [60, 62]) {
      const result = follower.receive(pitch);
      expect(result.decision).not.toBe('advanced');
      expect(result.tick === undefined || result.tick < 4).toBe(true);
    }
  }
});

test('waits through a shared opening and advances after the notes distinguish the next bar', () => {
  const follower = new ScoreFollower(
    practiceScore([[60], [62], [64], [65]], [[60], [62], [69], [71]]),
  );
  for (const pitch of [60, 62, 64, 65]) follower.receive(pitch);
  for (const pitch of [60, 62]) expect(follower.receive(pitch).decision).not.toBe('advanced');
  const distinct = follower.receive(69);
  expect(distinct.decision).toBe('advanced');
  expect(distinct.tick).toBe(6);
});

test('chord pitches can arrive in any order without a timing window', () => {
  for (const chord of [
    [67, 60, 64],
    [64, 67, 60],
  ]) {
    const follower = new ScoreFollower(practiceScore([[60, 64, 67], [62], [65]], [[69], [71]]));
    const result = chord.map((pitch) => follower.receive(pitch)).at(-1)!;
    expect(result.tick).toBe(0);
    expect(result.candidates[0]!.matchedPitches).toEqual([60, 64, 67]);
    expect(result.candidates[0]!.evidence.every((item) => item.kind === 'match')).toBe(true);
    expect(follower.receive(62).tick).toBe(1);
  }
});

test('repeated notes are separate attacks, rather than changes to the held-key set', () => {
  const follower = new ScoreFollower(practiceScore([[60], [60], [62]], [[67], [69]]));
  expect([60, 60, 62].map((pitch) => follower.receive(pitch).tick)).toEqual([0, 1, 2]);
});

test('tolerates a wrong attack, a missing note, and a partial chord and exposes that evidence', () => {
  const follower = new ScoreFollower(practiceScore([[60], [62], [64, 67], [65]], [[69], [71]]));
  follower.receive(60);
  expect(follower.receive(61).tick).toBeUndefined();
  const omitted = follower.receive(64);
  expect(omitted.tick).toBe(2);
  expect(omitted.candidates[0]!.evidence.flatMap((item) => item.missed)).toEqual([62]);
  const partial = follower.receive(65);
  expect(partial.tick).toBe(3);
  expect(partial.candidates[0]!.evidence.flatMap((item) => item.missed)).toEqual([62, 67]);
  expect(partial.candidates[0]!.evidence.filter((item) => item.kind === 'extra')).toHaveLength(1);
});

test('can enter the next bar after abandoning the current bar, but needs multiple matches', () => {
  const follower = new ScoreFollower(practiceScore([[60], [62], [64], [65]], [[69], [71]]));
  follower.receive(60);
  expect(follower.receive(69).decision).toBe('ambiguous');
  const next = follower.receive(71);
  expect(next.decision).toBe('advanced');
  expect(next.tick).toBe(5);
});

test('ignores distant matching passages until a manual anchor moves there', () => {
  const follower = new ScoreFollower(
    practiceScore([[60], [62]], [[64], [65]], [[69], [71]], [[72], [74]]),
  );
  for (const pitch of [72, 74, 72, 74]) {
    const result = follower.receive(pitch);
    expect(result.tick).toBeUndefined();
    expect(result.candidates.every((candidate) => candidate.bar <= 2)).toBe(true);
  }
  follower.reset(12);
  expect(follower.receive(72).tick).toBe(12);
  expect(follower.receive(74).tick).toBe(13);
});

test('uses actual meter boundaries and supports manual anchors within a bar', () => {
  const changing = practiceScore([[60], [62], [64], [65]], [[67], [69], [71]], [[72], [74]]);
  changing.meters.push({ at: 4, meter: '3/4' });
  changing.notes = changing.notes.map((note) => ({
    ...note,
    at: note.at >= 8 ? note.at - 1 : note.at,
    len: 1,
  }));
  const follower = new ScoreFollower(changing, 5);
  expect(follower.receive(69).tick).toBe(5);
  expect(follower.receive(71).tick).toBe(6);
  const next = follower.receive(72);
  expect(next.decision).toBe('advanced');
  expect(next.tick).toBe(7);
  expect(next.candidates[0]!.bar).toBe(3);
});

test('tempo, durations, and pauses do not enter the matching costs', () => {
  const original = practiceScore([[60], [62], [64]], [[67], [69]]);
  const changed = {
    ...original,
    tempos: [
      { at: 0, bpm: 200 },
      { at: 3, bpm: 20 },
    ],
  };
  const slow = new ScoreFollower(original);
  const fast = new ScoreFollower(changed);
  for (const pitch of [60, 62, 64, 67, 69])
    expect(fast.receive(pitch)).toEqual(slow.receive(pitch));
});

test('dense chords and long streams keep evidence bounded', () => {
  const chord = Array.from({ length: 12 }, (_, index) => 48 + index);
  const follower = new ScoreFollower(practiceScore([chord, chord, chord, chord], [chord]));
  for (let index = 0; index < 1000; index++) {
    const result = follower.receive(chord[index % chord.length]!);
    expect(result.candidates.length).toBeLessThanOrEqual(3);
    expect(result.candidates.every((candidate) => candidate.evidence.length <= 12)).toBe(true);
  }
});

test('follows the real prelude through shared openings without skipping bars', () => {
  const follower = new ScoreFollower(score);
  const attacks = [...score.notes].sort((a, b) => a.at - b.at);
  let tick = 0;
  for (let bar = 0; bar < 5; bar++) {
    const from = bar * 1920;
    for (const note of attacks.filter((note) => note.at >= from && note.at < from + 1920)) {
      const result = follower.receive(note.pitch);
      if (result.tick !== undefined) tick = result.tick;
      expect(tick).toBeLessThan(from + 1920);
    }
    expect(tick).toBeGreaterThanOrEqual(from);
  }
});

test('a retry before finishing a figure in the real prelude stays in the same bar', () => {
  const follower = new ScoreFollower(score);
  const attacks = [...score.notes].sort((a, b) => a.at - b.at).slice(0, 6);
  for (const note of attacks) follower.receive(note.pitch);
  expect(follower.receive(attacks[0]!.pitch).decision).toBe('ambiguous');
  const retry = follower.receive(attacks[1]!.pitch);
  expect(retry.decision).toBe('restarted');
  expect(retry.tick).toBe(attacks[1]!.at);
});

test('a retry that also matches the next figure within the real bar keeps that bar focused', () => {
  const follower = new ScoreFollower(score);
  const attacks = [...score.notes].sort((a, b) => a.at - b.at).slice(0, 8);
  for (const note of attacks) follower.receive(note.pitch);
  for (const note of attacks) {
    const result = follower.receive(note.pitch);
    expect(result.decision).not.toBe('advanced');
    expect(result.tick === undefined || result.tick < 1920).toBe(true);
  }
});
