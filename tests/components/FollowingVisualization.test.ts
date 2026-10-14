import { expect, test } from 'vite-plus/test';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { followingWindow, ScoreFollower, type MatchResult } from '../../src/following';
import { practiceScore } from '../helpers/score';
import { ornamentScore } from '../helpers/ornaments';
import { scoreBars } from '../../src/timing';
import FollowingVisualization from '../../src/components/FollowingVisualization.vue';

const example = practiceScore([[60], [62], [64], [65]], [[69], [71], [72], [74]]);
const bars = scoreBars(8, 1, example.meters);

function render(result: MatchResult | null, pitches: number[], focusBar = 1) {
  return renderToString(createSSRApp(FollowingVisualization, { result, pitches, bars, focusBar }));
}

test('recognized quick notes are shown as optional and excluded from the agreement counts', async () => {
  const follower = new ScoreFollower(ornamentScore(), 7680);
  const pitches = [60, 59, 60, 64, 65, 64];
  const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
  const html = await render(result, pitches);
  expect(html).toContain('data-match-kind="grace"');
  expect(html).toContain('optional quick note');
  expect(html).toContain('2 matched, 0 extra, 0 omitted');
});

test('the displayed move gates agree with a main-note move over an optional prefix', async () => {
  const score = ornamentScore();
  const follower = new ScoreFollower(score, 7680);
  const pitches = [60, 64, 67, 62, 69];
  const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
  expect(result.decision).toBe('advanced');
  const html = await renderToString(
    createSSRApp(FollowingVisualization, {
      result,
      pitches,
      bars: scoreBars(score.duration!, score.ppq, score.meters),
      focusBar: 6,
    }),
  );
  expect([...html.matchAll(/data-gate-met="([^"]+)"/g)].map((match) => match[1])).toEqual([
    'true',
    'true',
    'true',
  ]);
});

test('a retry aligns its short evidence with the latest inputs rather than the abandoned prefix', async () => {
  const follower = new ScoreFollower(example);
  const pitches = [60, 62, 64, 60, 62];
  const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
  expect(result.decision).toBe('restarted');
  const html = await render(result, pitches);
  const retry = [...html.matchAll(/<svg\b[^>]*data-evidence-mode="restart"[^>]*>/g)];
  expect(retry).toHaveLength(followingWindow);
  expect(retry.map(([element]) => element.match(/data-match-kind="([^"]+)"/)![1])).toEqual([
    ...Array(7).fill('empty'),
    'unused',
    'unused',
    'unused',
    'match',
    'match',
  ]);
  expect(html).toContain('Before this interpretation began');
  expect(html).toContain('D4: matched at bar 1, beat 2');
});

test('extra and omitted notes are distinct and omissions preserve the input columns', async () => {
  const follower = new ScoreFollower({
    ...example,
    notes: [...example.notes, { pitch: 67, at: 2, len: 1, groups: [] }],
  });
  const pitches = [60, 61, 64, 65];
  const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
  const html = await render(result, pitches);
  const continuation = [...html.matchAll(/<svg\b[^>]*data-evidence-mode="continue"[^>]*>/g)];
  expect(continuation).toHaveLength(followingWindow);
  expect(continuation.map(([element]) => element.match(/data-match-kind="([^"]+)"/)![1])).toEqual([
    ...Array(8).fill('empty'),
    'match',
    'extra',
    'match',
    'match',
  ]);
  expect(html).toContain('C♯4: extra');
  expect(html).toContain('Omitted: D4');
  expect(html).toContain('Omitted: G4');
  expect(
    continuation.filter(([element]) => element.includes('data-missed-count="1"')),
  ).toHaveLength(2);
});

test('a better next-bar candidate with only one supporting match still has an unmet move condition', async () => {
  const follower = new ScoreFollower(example);
  const pitches = [60, 69];
  const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
  expect(result.decision).toBe('ambiguous');
  expect(result.tick).toBeUndefined();
  expect(result.candidates[0]!.mode).toBe('next');
  const html = await render(result, pitches);
  expect(html).toContain('Matches 1/2');
  expect([...html.matchAll(/data-gate-met="([^"]+)"/g)].map((match) => match[1])).toEqual([
    'false',
    'true',
    'true',
  ]);
  expect([...html.matchAll(/data-candidate-mode="([^"]+)"/g)].map((match) => match[1])).toEqual([
    'continue',
    'restart',
    'previous',
    'previous',
    'next',
    'jump',
    'jump',
    'jump',
  ]);
});

test('identical openings show insufficient separation even after several matching notes', async () => {
  const follower = new ScoreFollower({
    ...example,
    notes: [60, 62, 64, 65, 60, 62, 69, 71].map((pitch, at) => ({
      pitch,
      at,
      len: 1,
      groups: [],
    })),
  });
  const pitches = [60, 62, 64, 65, 60, 62];
  const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
  expect(result.decision).toBe('ambiguous');
  const html = await render(result, pitches);
  const gates = [...html.matchAll(/data-gate-met="([^"]+)"/g)].map((match) => match[1]);
  expect(gates).toEqual(['true', 'false', 'true']);
});

test('a confirmed move shows its original alternatives and all satisfied conditions', async () => {
  const follower = new ScoreFollower(example);
  const pitches = [60, 69, 71];
  const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
  expect(result.decision).toBe('advanced');
  const html = await render(result, pitches, 2);
  expect(html).toContain('Continue · Bar 1');
  expect(html).toContain('Next · Bar 2');
  expect([...html.matchAll(/data-gate-met="([^"]+)"/g)].map((match) => match[1])).toEqual([
    'true',
    'true',
    'true',
  ]);
  expect(html).toContain('data-candidate-table');
  expect(html).not.toContain('data-candidate-overview');
});

test('the final bar does not invent another bar to follow', async () => {
  const follower = new ScoreFollower(example, 4);
  const html = await render(follower.receive(69), [69], 2);
  expect(html).toContain('End of score');
  expect(html).not.toContain('Next · Bar 3');
  expect(html).not.toContain('data-move-gates');
});

test('the input window keeps the newest notes on the right and distinguishes empty columns from unused evidence', async () => {
  const pitches = Array.from({ length: followingWindow + 3 }, (_, index) => 60 + index);
  const follower = new ScoreFollower(example);
  const result = pitches.map((pitch) => follower.receive(pitch)).at(-1)!;
  const html = await render(result, pitches);
  const cells = [
    ...html.matchAll(/<svg\b[^>]*data-evidence-mode="continue"[^>]*>[\s\S]*?<\/svg>/g),
  ];
  expect(cells).toHaveLength(followingWindow);
  expect(cells[0]![0]).toContain('D♯4');
  expect(cells.at(-1)![0]).toContain('D5');
  expect(cells.some(([cell]) => cell.includes('data-match-kind="empty"'))).toBe(false);
  const waiting = await render(null, []);
  expect([...waiting.matchAll(/data-candidate-slot=/g)]).toHaveLength(8);
  expect(waiting).not.toContain('data-candidate-score');
});
