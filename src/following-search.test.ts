import { expect, test } from 'vite-plus/test';
import { matchStats, ScoreFollower } from './following';
import { automaticLocation, FollowingSearch } from './following-search';
import { distantScore, practiceScore, score } from './test/score';

function run(search: FollowingSearch, pitches: number[]) {
  const iterator = search.search(pitches);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}

test('a distant partial phrase appears before there is enough evidence for an automatic jump', () => {
  const search = new FollowingSearch(new ScoreFollower(distantScore).reference);
  const candidates = run(search, [50, 52]);
  expect(candidates[0]).toMatchObject({ bar: 5, at: 18, matchedPitches: [52] });
  expect(matchStats(candidates[0]!).matches).toBe(2);
  expect(automaticLocation(candidates, 1, false)).toBeUndefined();
  expect(automaticLocation(candidates, 1, true)).toBeUndefined();
});

test('a distinguishing phrase can reacquire a distant location only when enabled', () => {
  const search = new FollowingSearch(new ScoreFollower(distantScore).reference);
  const candidates = run(search, [48, 50, 52, 53, 55, 57]);
  expect(candidates[0]).toMatchObject({ bar: 6, at: 21 });
  expect(automaticLocation(candidates, 1, false)).toBeUndefined();
  expect(automaticLocation(candidates, 1, true)?.at).toBe(21);
});

test('indistinguishable distant phrases remain choices instead of an automatic jump', () => {
  const repeated = practiceScore(
    [[60], [62]],
    [[64], [65]],
    [[67], [69]],
    [[71], [72]],
    [[48], [50], [52], [53]],
    [[55], [57]],
    [[48], [50], [52], [53]],
    [[55], [57]],
  );
  const candidates = run(
    new FollowingSearch(new ScoreFollower(repeated).reference),
    [48, 50, 52, 53, 55, 57],
  );
  expect(
    candidates
      .slice(0, 2)
      .map((item) => item.bar)
      .sort((a, b) => a - b),
  ).toEqual([6, 8]);
  expect(automaticLocation(candidates, 1, true)).toBeUndefined();
});

test('whole-score search supports unordered chords and repeated attacks', () => {
  const music = practiceScore(
    [[80], [81]],
    [[82], [83]],
    [[84], [85]],
    [[86], [87]],
    [[48, 52, 55], [50, 53, 57], [57], [59]],
  );
  const candidates = run(
    new FollowingSearch(new ScoreFollower(music).reference),
    [55, 48, 52, 57, 50, 53, 57, 59],
  );
  expect(candidates[0]).toMatchObject({ bar: 5, at: 19 });
  expect(matchStats(candidates[0]!).matches).toBe(8);
});

test('agreement scores account for extra and omitted notes', () => {
  const search = new FollowingSearch(new ScoreFollower(distantScore).reference);
  const extra = run(search, [48, 50, 52, 53, 55, 90, 57])[0]!;
  expect(matchStats(extra)).toMatchObject({ matches: 6, extra: 1, missed: 0 });
  expect(matchStats(extra).score).toBeCloseTo(6 / 7);
  const omitted = run(search, [48, 50, 52, 53, 55, 57, 60])[0]!;
  expect(matchStats(omitted)).toMatchObject({ matches: 7, extra: 0, missed: 1 });
  expect(matchStats(omitted).score).toBeCloseTo(7 / 8);
});

test('a chord alone does not provide enough independent positions for an automatic distant jump', () => {
  const music = practiceScore([[80]], [[81]], [[82]], [[83]], [[48, 50, 52, 53, 55, 57]]);
  const candidates = run(
    new FollowingSearch(new ScoreFollower(music).reference),
    [48, 50, 52, 53, 55, 57],
  );
  expect(matchStats(candidates[0]!).matches).toBe(6);
  expect(automaticLocation(candidates, 1, true)).toBeUndefined();
});

test('an unmatched latest attack prevents an automatic jump', () => {
  const candidates = run(
    new FollowingSearch(new ScoreFollower(distantScore).reference),
    [48, 50, 52, 53, 55, 57, 90],
  );
  expect(automaticLocation(candidates, 1, true)).toBeUndefined();
});

test('search yields in large scores and returns bounded results', () => {
  const music = practiceScore(...Array.from({ length: 100 }, () => [[48], [50], [52], [53]]));
  const iterator = new FollowingSearch(new ScoreFollower(music).reference).search([48, 50, 52, 53]);
  let step = iterator.next();
  let yielded = 0;
  while (!step.done) {
    yielded++;
    step = iterator.next();
  }
  expect(yielded).toBeGreaterThan(0);
  expect(step.value.length).toBeLessThanOrEqual(12);
});

test('whole-score search finds a played passage in the real prelude', () => {
  const pitches = [...score.notes]
    .sort((a, b) => a.at - b.at)
    .filter((note) => note.at >= 10 * 1920 && note.at < 11 * 1920)
    .slice(0, 12)
    .map((note) => note.pitch);
  const candidates = run(new FollowingSearch(new ScoreFollower(score).reference), pitches);
  const location = candidates.find((candidate) => candidate.bar === 11);
  expect(location).toBeDefined();
  expect(matchStats(location!).matches).toBe(12);
});
