import { createPinia } from 'pinia';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { expect, test } from 'vite-plus/test';
import { scoreLines } from '../src/layout';
import { ScoreFollower } from '../src/following';
import { useScoreStore } from '../src/stores/score';
import MusicNotation from '../src/components/MusicNotation.vue';
import { createScore } from './helpers/score';

test('opening lead-in is visible without adding a measure or moving the first beat', async () => {
  const score = createScore({
    notes: [
      {
        pitch: 60,
        at: 0,
        len: 480,
        groups: ['rh'],
        ornament: { timing: 'beforeStart', pitches: [59, 62], len: 120 },
      },
    ],
    sections: [{ at: 0, title: 'Opening' }],
  });
  const sheet = useScoreStore(createPinia());
  sheet.load(score);
  for (const variableBarWidth of [false, true]) {
    const lines = scoreLines(sheet.notes, 480, {
      ppq: 480,
      meters: score.meters,
      width: 800,
      rem: 16,
      foldThreshold: 12,
      variableBarWidth,
    });
    expect(lines[0]!.from).toBe(-120);
    expect(lines[0]!.bars[0]!.number).toBe(1);
    expect(lines[0]!.bars[0]!.beats[0]!.from).toBe(0);
    expect(lines[0]!.notes).toHaveLength(3);
    const html = await renderToString(
      createSSRApp(MusicNotation, {
        score,
        totalTicks: 480,
        foldThreshold: 12,
        variableBarWidth,
        playhead: -60,
        playing: true,
        selection: { kind: 'notes', indices: [] },
      }),
    );
    expect(html).toContain('Opening');
    expect(html.match(/data-note-index=/g)).toHaveLength(3);
    expect(html.match(/Grace note/g)).toHaveLength(2);
  }
  expect(sheet.totalTicks).toBe(480);
  expect(sheet.bars[0]!.from).toBe(0);
});

test('selecting a main note previews its ornaments and retains the authored score', () => {
  const score = createScore({
    notes: [
      {
        pitch: 60,
        at: 0,
        len: 480,
        groups: ['rh'],
        ornament: { timing: 'atStart', pitches: [62], len: 120 },
      },
    ],
  });
  const sheet = useScoreStore(createPinia());
  sheet.load(score);
  sheet.selection = { kind: 'notes', indices: [1] };
  expect(sheet.selectedNotes.map(({ pitch }) => pitch)).toEqual([62, 60]);
  expect(sheet.span).toEqual({ from: 0, to: 480 });
  expect(sheet.score).toEqual(score);
  expect(sheet.score!.notes).toHaveLength(1);
});

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
      { pitch: 72, at: 240, len: 1440, groups: ['rh'] },
      {
        pitch: 72,
        at: 1680,
        len: 480,
        groups: ['rh'],
        ornament: { timing: 'beforeStart', pitches: [74, 76], len: 60 },
      },
      {
        pitch: 69,
        at: 2160,
        len: 240,
        groups: ['rh'],
        ornament: { timing: 'atStart', pitches: [70], len: 30 },
      },
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
    const lines = scoreLines(sheet.notes, sheet.totalTicks, {
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
      sheet.notes.length,
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
    expect(html).toContain(`data-note-index="${sheet.notes.length - 1}"`);
  },
);

test('following keeps grace sequences optional at their principal original onsets', () => {
  const follower = new ScoreFollower(scoreFixture());
  expect(follower.reference.events.filter(({ at }) => at >= 1620 && at <= 2400)).toEqual([
    { at: 1680, pitches: [72], bar: 1, grace: [{ notes: [[74], [76]], main: [72], before: true }] },
    { at: 2160, pitches: [69], bar: 2, grace: [{ notes: [[70]], main: [69], before: true }] },
    { at: 2400, pitches: [60, 64, 67], bar: 2 },
  ]);
});

test('manual following anchors work in both pickup and numbered measures', () => {
  const follower = new ScoreFollower(scoreFixture());
  for (const [bar, at, pitch] of [
    [0, 0, 69],
    [1, 240, 72],
    [2, 2160, 69],
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
