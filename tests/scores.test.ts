import { createPinia } from 'pinia';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { expect, test } from 'vite-plus/test';
import { scoreLines } from '../src/layout';
import { ScoreFollower } from '../src/following';
import { useScoreStore } from '../src/stores/score';
import MusicNotation from '../src/components/MusicNotation.vue';
import { createScore } from './helpers/score';

function scoreFixture() {
  return createScore({
    pickup: 240,
    duration: 4080,
    tempos: [
      { at: 0, bpm: 60 },
      { at: 2160, bpm: 90 },
    ],
    groups: [
      { id: 'rh', name: 'Right hand', kind: 'hand', hand: 'right' },
      { id: 'lh', name: 'Left hand', kind: 'hand', hand: 'left' },
    ],
    notes: [
      { pitch: 69, at: 0, len: 240, groups: ['rh'] },
      { pitch: 48, at: 240, len: 3840, groups: ['lh'] },
      { pitch: 72, at: 240, len: 1380, groups: ['rh'] },
      { pitch: 74, at: 1620, len: 30, groups: ['rh'], grace: true },
      { pitch: 76, at: 1650, len: 30, groups: ['rh'], grace: true },
      { pitch: 72, at: 1680, len: 480, groups: ['rh'] },
      { pitch: 70, at: 2160, len: 30, groups: ['rh'], grace: true },
      { pitch: 69, at: 2190, len: 210, groups: ['rh'] },
      ...[60, 64, 67].map((pitch) => ({ pitch, at: 2400, len: 960, groups: ['rh'] })),
      { pitch: 72, at: 3360, len: 240, groups: ['rh'] },
    ],
  });
}

test.each([false, true])(
  'a score with pickup, grace sequences, and a held bass retains its identity with variable widths %s',
  async (variableBarWidth) => {
    const score = scoreFixture();
    const sheet = useScoreStore(createPinia());
    sheet.load(score);
    expect(sheet.totalTicks).toBe(4080);
    expect(sheet.barCount).toBe(2);
    expect(sheet.bars.map(({ number, from, to }) => [number, from, to])).toEqual([
      [0, 0, 240],
      [1, 240, 2160],
      [2, 2160, 4080],
    ]);
    const lines = scoreLines(score.notes, sheet.totalTicks, {
      ppq: score.ppq,
      meters: score.meters,
      pickup: score.pickup,
      width: 320,
      rem: 16,
      foldThreshold: 12,
      variableBarWidth,
    });
    expect(lines.at(-1)!.to).toBe(4080);
    expect(new Set(lines.flatMap((line) => line.notes.map(({ index }) => index))).size).toBe(
      score.notes.length,
    );
    expect(new ScoreFollower(score).reference.bars).toEqual(sheet.bars);
    const html = await renderToString(
      createSSRApp(MusicNotation, {
        score,
        totalTicks: sheet.totalTicks,
        foldThreshold: 12,
        variableBarWidth,
        playhead: 0,
        playing: false,
        selection: { kind: 'notes', indices: [3] },
      }),
    );
    for (const index of [3, 4, 6]) {
      const bar = html.match(
        new RegExp(`<button\\b[^>]*data-note-index="${index}"[^>]*>[\\s\\S]*?<\\/button>`),
      )![0];
      expect(bar).toContain('Grace note');
      expect(bar).not.toContain('data-pitch-label');
    }
    const held = html.match(/<button\b[^>]*data-note-index="1"[^>]*>/g)!;
    expect(held.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain(`data-note-index="${score.notes.length - 1}"`);
  },
);

test('following retains grace attacks as separate events before the principal and after its original onset', () => {
  const follower = new ScoreFollower(scoreFixture());
  expect(follower.reference.events.filter(({ at }) => at >= 1620 && at <= 2400)).toEqual([
    { at: 1620, pitches: [74], bar: 1 },
    { at: 1650, pitches: [76], bar: 1 },
    { at: 1680, pitches: [72], bar: 1 },
    { at: 2160, pitches: [70], bar: 2 },
    { at: 2190, pitches: [69], bar: 2 },
    { at: 2400, pitches: [60, 64, 67], bar: 2 },
  ]);
});

test('manual following anchors work in both pickup and numbered measures', () => {
  const follower = new ScoreFollower(scoreFixture());
  for (const [bar, at, pitch] of [
    [0, 0, 69],
    [1, 240, 72],
    [2, 2160, 70],
  ]) {
    follower.choose({
      mode: 'jump',
      bar: bar!,
      at: at!,
      pitches: [pitch!],
      matchedPitches: [],
      cost: 0,
      evidence: [],
    });
    const result = follower.receive(pitch!);
    expect(result.tick).toBe(at);
    expect(result.reason).toContain(`bar ${bar}:`);
  }
});
