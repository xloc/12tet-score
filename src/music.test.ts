import assert from 'node:assert/strict';
import { test } from 'vite-plus/test';
import {
  barCount,
  notePlacement,
  pitchLabel,
  score,
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
    gridRow: 14,
    gridColumn: '1 / span 4',
  });
  assert.deepEqual(notePlacement({ ...base, len: 960 }, 0, ticksPerBar, 72, score.ppq), {
    gridRow: 14,
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
    gridRow: 14,
    gridColumn: '1 / span 3',
  });
  assert.equal(note.len, 480);
});

test('notation geometry uses the supplied tick resolution instead of the demo score', () => {
  const note = { pitch: 60, at: 240, len: 240, voice: 1 };
  assert.deepEqual(notePlacement(note, 0, 960, 72, 240), {
    gridRow: 14,
    gridColumn: '5 / span 4',
  });
});
