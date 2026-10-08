import assert from 'node:assert/strict';
import { test } from 'vite-plus/test';
import { notePlacement, barPosition, scoreLines, timePlacement, type ScoreLayout } from './layout';
import type { Note } from './music';
import { tickAtPoint } from './selection';
import { score, totalTicks, fixedGeometry, positionAtTick } from './test/score';

const layout: ScoreLayout = {
  ppq: 480,
  ticksPerBar: 1920,
  width: 512,
  rem: 16,
  foldThreshold: 12,
  variableBarWidth: true,
};
const dense: Note[] = Array.from({ length: 16 }, (_, index) => ({
  pitch: 60,
  at: index * 120,
  len: 120,
  voice: 1,
}));
const chord: Note[] = [60, 64, 67, 72, 76].map((pitch) => ({
  pitch,
  at: 1920,
  len: 1920,
  voice: 2,
}));

test('a held chord and a silent bar are narrower than dense rhythm regardless of chord size', () => {
  const widths = [
    [],
    [{ pitch: 60, at: 0, len: 1920, voice: 1 }],
    chord.map((note) => ({ ...note, at: 0 })),
    dense,
  ].map((notes) => scoreLines(notes, 1920, { ...layout, width: 2048 })[0]!.maximum);
  assert.deepEqual(widths, [128, 128, 128, 512]);
});

test('bar widths vary continuously with rhythm and are independent of tick resolution', () => {
  const notes = Array.from({ length: 6 }, (_, index) => ({
    pitch: 60,
    at: index * 320,
    len: 320,
    voice: 1,
  }));
  assert.equal(scoreLines(notes, 1920, layout)[0]!.maximum, 192);
  assert.equal(
    scoreLines(
      notes.map((note) => ({ ...note, at: note.at / 2, len: note.len / 2 })),
      960,
      {
        ...layout,
        ppq: 240,
        ticksPerBar: 960,
      },
    )[0]!.maximum,
    192,
  );
});

test('moderate compression fits a simple chord into the preceding line', () => {
  const notes = [...dense, ...chord];
  const uniform = scoreLines(notes, 3840, { ...layout, variableBarWidth: false });
  const variable = scoreLines(notes, 3840, layout);
  assert.equal(uniform.length, 2);
  assert.equal(variable.length, 1);
  const line = variable[0]!;
  assert.equal(line.minimum, 480);
  assert.equal(line.maximum, 640);
  assert.equal(line.to, 3840);
  assert.deepEqual(
    line.bars.map(({ minimum, preferred }) => ({ minimum, preferred })),
    [
      { minimum: 384, preferred: 512 },
      { minimum: 96, preferred: 128 },
    ],
  );
});

test('seeking and range placement share the nonuniform playback time mapping', () => {
  const line = scoreLines([...dense, ...chord], 3840, layout)[0]!;
  const geometry = fixedGeometry(line, [409.6, 102.4]);
  const bounds = [
    {
      ...line,
      left: 40,
      right: 552,
      top: 100,
      bottom: 300,
      bars: geometry.bars.map((bar) => ({
        ...bar,
        left: 40 + bar.left,
        right: 40 + bar.left + bar.width,
      })),
    },
  ];
  for (const tick of [0, 120, 480, 1800, 1920, 2040, 2880, 3840]) {
    const position = positionAtTick(tick, geometry.bars);
    assert.equal(tickAtPoint({ x: 40 + position, y: 200 }, bounds, 480), tick);
  }
  assert.deepEqual(timePlacement(1920, 2880, line.bars[1]!), { left: '0%', width: '50%' });
  assert.equal(barPosition(-120, line.bars[0]!), 0);
  assert.equal(barPosition(4000, line.bars[1]!), 1);
  assert.equal(tickAtPoint({ x: -100, y: 200 }, bounds, 480), 0);
  assert.equal(tickAtPoint({ x: 2000, y: 200 }, bounds, 480), 3840);
  // Quantization still snaps to sixteenth notes in the compressed bar.
  assert.equal(
    tickAtPoint({ x: 40 + positionAtTick(2100, geometry.bars), y: 200 }, bounds, 480),
    2160,
  );
});

test('a note spanning unequal bars has contiguous fragments with proportional time inside each bar', () => {
  const held = { pitch: 48, at: 1440, len: 2400, voice: 3 };
  const line = scoreLines([...dense, ...chord, held], 3840, layout)[0]!;
  const geometry = fixedGeometry(line, [409.6, 102.4]);
  const first = notePlacement(held, line, line.bars[0]!);
  const next = notePlacement(held, line, line.bars[1]!);
  assert.equal(first.left, '75%');
  assert.equal(first.width, '25%');
  assert.equal(next.left, '0%');
  assert.equal(next.width, '100%');
  assert.equal(line.bars[0]!.notes.at(-1)!.index, line.bars[1]!.notes.at(-1)!.index);
  assert.equal(line.notes.at(-1)!.note, held);
  for (const bar of geometry.bars) {
    const midpoint = positionAtTick((bar.from + bar.to) / 2, geometry.bars);
    assert(Math.abs(midpoint - (bar.left + bar.width / 2)) < 1e-9);
  }
});

test('a single brief note retains readable length and label space on a narrow screen', () => {
  const note = { pitch: 61, at: 0, len: 120, voice: 1 };
  const line = scoreLines([note], 1920, { ...layout, width: 200 })[0]!;
  assert.equal(line.minimum, 448);
  const geometry = fixedGeometry(line, [448]);
  const placement = notePlacement(note, line, line.bars[0]!);
  assert.equal((parseFloat(placement.width!) / 100) * geometry.width, 28);
  assert(line.bars[0]!.beats.every((beat) => barPosition(beat.to, line.bars[0]!) <= 1));
});

test('the final held chord keeps its compact width and fractional note times retain exact geometry', () => {
  const notes = [...dense, ...chord];
  const lines = scoreLines(notes, 3840, { ...layout, width: 450 });
  assert.equal(lines.length, 2);
  assert.equal(lines[1]!.maximum, 128);
  const note = { pitch: 60, at: 17, len: 83, voice: 1 };
  const line = scoreLines([note], 100, layout)[0]!;
  assert.equal(line.to, 100);
  assert.equal(line.bars[0]!.beats.length, 1);
  assert.equal(notePlacement(note, line, line.bars[0]!).left, '17%');
  assert(Math.abs(parseFloat(notePlacement(note, line, line.bars[0]!).width!) - 83) < 1e-9);
});

test('resizing preserves all score time, bar boundaries, held-note identity, and pitch folding', () => {
  const held = { pitch: 36, at: 1440, len: 960, voice: 3 };
  const notes = [
    ...dense,
    ...chord,
    ...dense.map((note) => ({ ...note, at: note.at + 5760 })),
    held,
  ];
  const original = structuredClone(notes);
  for (const width of [90, 450, 512, 1024, 1800]) {
    const lines = scoreLines(notes, 8000, { ...layout, width });
    assert.equal(lines[0]!.from, 0);
    assert.equal(lines.at(-1)!.to, 8000);
    assert.equal(
      lines.reduce((sum, line) => sum + line.to - line.from, 0),
      8000,
    );
    for (const [index, line] of lines.entries()) {
      if (index) assert.equal(line.from, lines[index - 1]!.to);
      assert.equal(line.from % 1920, 0);
      assert(line.bars.every((bar) => bar.minimum <= bar.preferred));
      assert(
        line.notes.every(
          ({ note, index }) => note === notes[index] && line.rows.includes(note.pitch),
        ),
      );
    }
    const carried = lines.filter((line) => line.notes.some(({ note }) => note === held));
    assert(carried.length >= 1);
  }
  assert.deepEqual(notes, original);
});

test('Bach’s closing chord can share a line with its preceding dense bars', () => {
  const lines = scoreLines(score.notes, totalTicks, { ...layout, width: 1024 });
  const last = lines.at(-1)!;
  assert(last.bars.length >= 2);
  assert.equal(last.bars.at(-1)!.from, 34 * 1920);
  assert(last.bars.at(-1)!.preferred < last.bars[0]!.preferred);
});
