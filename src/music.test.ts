import assert from 'node:assert/strict';
import { test } from 'vite-plus/test';
import {
  barCount,
  notePlacement,
  pitchLabel,
  score,
  scoreLines,
  seconds,
  ticksPerBar,
  totalTicks,
} from './music.ts';

test('the complete prelude has 35 measures, 549 notes, and three voices', () => {
  assert.equal(barCount, 35);
  assert.equal(score.notes.length, 549);
  assert.equal(totalTicks, 67200);
  assert.equal(seconds(totalTicks, score.bpm), 140);
  for (const voice of score.voices) {
    const notes = score.notes.filter((note) => note.voice === voice.id);
    assert.equal(Math.max(...notes.map((note) => note.at + note.len)), totalTicks);
    assert(
      notes.every(
        (note) => Number.isInteger(note.at) && Number.isInteger(note.len) && note.len > 0,
      ),
    );
  }
});

test('the opening preserves the held bass and tied middle note beneath the arpeggio', () => {
  assert.deepEqual(
    score.notes.filter((note) => note.at < 600),
    [
      { pitch: 60, at: 0, len: 960, voice: 3 },
      { pitch: 64, at: 120, len: 840, voice: 2 },
      { pitch: 67, at: 240, len: 120, voice: 1 },
      { pitch: 72, at: 360, len: 120, voice: 1 },
      { pitch: 76, at: 480, len: 120, voice: 1 },
    ],
  );
  assert.deepEqual(
    score.notes.filter((note) => note.at === 960),
    [{ pitch: 60, at: 960, len: 960, voice: 3 }],
  );
});

test('the closing chord contains five sustained notes in the final measure', () => {
  const closing = score.notes.filter((note) => note.at === 34 * ticksPerBar);
  assert.deepEqual(
    closing.map((note) => note.pitch).sort((a, b) => a - b),
    [36, 48, 64, 67, 72],
  );
  assert(closing.every((note) => note.len === ticksPerBar));
  assert.equal(score.annotations.at(-1)?.kind, 'performance');
});

test('pitch labels retain register across octave boundaries', () => {
  assert.equal(pitchLabel(60), 'C4');
  assert.equal(pitchLabel(61), 'C♯4');
  assert.equal(pitchLabel(71), 'B4');
  assert.equal(pitchLabel(72), 'C5');
});

test('duration is proportional and semitone geometry survives transposition', () => {
  const base = { pitch: 60, at: 0, len: 480, voice: 1 };
  assert.deepEqual(notePlacement(base, 0, ticksPerBar, 72, score.ppq), {
    gridRow: 13,
    gridColumn: '1 / span 4',
  });
  assert.deepEqual(notePlacement({ ...base, len: 960 }, 0, ticksPerBar, 72, score.ppq), {
    gridRow: 13,
    gridColumn: '1 / span 8',
  });
  const third = { ...base, pitch: 64 };
  assert.equal(
    notePlacement(base, 0, ticksPerBar, 72, score.ppq).gridRow -
      notePlacement(third, 0, ticksPerBar, 72, score.ppq).gridRow,
    4,
  );
  assert.deepEqual(
    notePlacement({ ...base, pitch: 62 }, 0, ticksPerBar, 74, score.ppq),
    notePlacement(base, 0, ticksPerBar, 72, score.ppq),
  );
});

test('a held note crossing the viewing boundary is clipped without changing source duration', () => {
  const note = { pitch: 60, at: 1800, len: 480, voice: 1 };
  assert.deepEqual(notePlacement(note, 1920, 3840, 72, score.ppq), {
    gridRow: 13,
    gridColumn: '1 / span 3',
  });
  assert.equal(note.len, 480);
});

test('notation geometry uses the supplied tick resolution instead of the demo score', () => {
  const note = { pitch: 60, at: 240, len: 240, voice: 1 };
  assert.deepEqual(notePlacement(note, 0, 960, 72, 240), {
    gridRow: 13,
    gridColumn: '5 / span 4',
  });
});

test('score lines break at measure boundaries and crop each line to its sounding pitches', () => {
  const lines = scoreLines(score.notes, totalTicks, ticksPerBar, 2);
  assert.equal(lines.length, 18);
  assert.deepEqual(
    lines.slice(0, 2).map(({ from, to }) => ({ from, to })),
    [
      { from: 0, to: 3840 },
      { from: 3840, to: 7680 },
    ],
  );
  assert.equal(lines[0]!.lowestPitch, 60);
  assert.equal(lines[0]!.highestPitch, 77);
  assert.equal(lines.at(-1)!.from, 34 * ticksPerBar);
  assert.equal(lines.at(-1)!.to, totalTicks);
  assert.equal(lines.at(-1)!.lowestPitch, 36);
  assert.equal(lines.at(-1)!.highestPitch, 72);
  assert.deepEqual(
    [...new Set(lines.flatMap((line) => line.notes.map(({ index }) => index)))].sort(
      (a, b) => a - b,
    ),
    score.notes.map((_, index) => index),
  );
});

test('notes held across a line break keep their identity and contribute to both pitch ranges', () => {
  const held = { pitch: 48, at: 1440, len: 960, voice: 3 };
  const upper = { pitch: 76, at: 1920, len: 480, voice: 1 };
  const lines = scoreLines([held, upper], 3840, 1920, 1);
  assert.equal(lines[0]!.notes[0]!.note, held);
  assert.equal(lines[1]!.notes[0]!.note, held);
  assert.equal(lines[0]!.notes[0]!.index, lines[1]!.notes[0]!.index);
  assert.equal(lines[0]!.lowestPitch, 48);
  assert.equal(lines[0]!.highestPitch, 48);
  assert.equal(lines[1]!.lowestPitch, 48);
  assert.equal(lines[1]!.highestPitch, 76);
  assert.deepEqual(notePlacement(held, 0, 1920, 48, 480), {
    gridRow: 1,
    gridColumn: '13 / span 4',
  });
  assert.deepEqual(notePlacement(held, 1920, 3840, 76, 480), {
    gridRow: 29,
    gridColumn: '1 / span 4',
  });
  assert.equal(held.len, 960);
});

test('changing line width changes wrapping without changing notes or elapsed time', () => {
  for (const barsPerLine of [1, 2, 3, 4]) {
    const lines = scoreLines(score.notes, totalTicks, ticksPerBar, barsPerLine);
    assert.equal(lines[0]!.from, 0);
    assert.equal(lines.at(-1)!.to, totalTicks);
    assert.equal(
      lines.reduce((ticks, line) => ticks + line.to - line.from, 0),
      totalTicks,
    );
    for (let index = 1; index < lines.length; index++) {
      assert.equal(lines[index]!.from, lines[index - 1]!.to);
      assert.equal(lines[index]!.from % ticksPerBar, 0);
    }
  }
});

test('a silent measure keeps its place between sounding measures', () => {
  const notes = [
    { pitch: 60, at: 0, len: 480, voice: 1 },
    { pitch: 72, at: 3840, len: 480, voice: 1 },
  ];
  const lines = scoreLines(notes, 5760, 1920, 1);
  assert.equal(lines.length, 3);
  assert.equal(lines[1]!.notes.length, 0);
  assert.equal(lines[1]!.from, 1920);
  assert(Number.isFinite(lines[1]!.highestPitch - lines[1]!.lowestPitch));
});
