import assert from 'node:assert/strict';
import { test } from 'vite-plus/test';
import { pitchLabel, seconds, scoreDuration } from '../src/music.ts';
import { notePlacement, pitchRows, scoreLines, type ScoreLayout } from '../src/layout';
import { createScore } from './helpers/score';

const ticksPerBar = 1920;

const layout: ScoreLayout = {
  ppq: 480,
  meters: [{ at: 0, meter: '4/4' }],
  width: 512,
  rem: 16,
  foldThreshold: 0,
  variableBarWidth: false,
};

test('score duration is zero when there are no timed events beyond the origin', () => {
  assert.equal(scoreDuration(createScore()), 0);
});

test('seconds uses the supplied tempo and tick resolution', () => {
  assert.equal(seconds(240, 120, 240), 0.5);
  assert.equal(seconds(480, 60, 960), 0.5);
});

test('score duration includes a held note that outlasts later attacks', () => {
  const score = createScore({
    notes: [
      { pitch: 48, at: 0, len: 1920, groups: [] },
      { pitch: 72, at: 480, len: 120, groups: [] },
    ],
  });
  assert.equal(scoreDuration(score), 1920);
  assert.equal(seconds(1920, 60, 480), 4);
});

test('score duration includes timed metadata after the last note', () => {
  for (const metadata of [
    { annotations: [{ at: 960, len: 960, text: 'Rest' }] },
    { chords: [{ at: 960, len: 960, root: 'C', type: 'major' }] },
    { pitchGuides: [{ at: 960, len: 960, pitches: [60] }] },
    { pedals: [{ at: 960, len: 960, type: 'sustain' as const }] },
    { sections: [{ at: 1920, title: 'Coda' }] },
    {
      tempos: [
        { at: 0, bpm: 60 },
        { at: 1920, bpm: 80 },
      ],
    },
    {
      meters: [
        { at: 0, meter: '4/4' },
        { at: 1920, meter: '3/4' },
      ],
    },
  ]) {
    assert.equal(
      scoreDuration(
        createScore({
          notes: [{ pitch: 60, at: 0, len: 480, groups: [] }],
          ...metadata,
        }),
      ),
      1920,
    );
  }
});

test('pitch labels retain register across octave boundaries', () => {
  assert.equal(pitchLabel(60), 'C4');
  assert.equal(pitchLabel(61), 'C♯4');
  assert.equal(pitchLabel(71), 'B4');
  assert.equal(pitchLabel(72), 'C5');
});

test('duration is proportional and semitone geometry survives transposition', () => {
  const base = { pitch: 60, at: 0, len: 480, groups: ['rh', '1'] };
  const notes = [base, { ...base, pitch: 72 }];
  const line = scoreLines(notes, ticksPerBar, layout)[0]!;
  assert.deepEqual(notePlacement(base, line, line.bars[0]!), {
    gridRow: 13,
    gridColumn: '1 / -1',
    left: '0%',
    width: '25%',
  });
  assert.deepEqual(notePlacement({ ...base, len: 960 }, line, line.bars[0]!), {
    gridRow: 13,
    gridColumn: '1 / -1',
    left: '0%',
    width: '50%',
  });
  const third = { ...base, pitch: 64 };
  assert.equal(
    notePlacement(base, line, line.bars[0]!).gridRow -
      notePlacement(third, line, line.bars[0]!).gridRow,
    4,
  );
  assert.deepEqual(
    notePlacement(
      { ...base, pitch: 62 },
      scoreLines(
        notes.map((note) => ({ ...note, pitch: note.pitch + 2 })),
        ticksPerBar,
        layout,
      )[0]!,
      line.bars[0]!,
    ),
    notePlacement(base, line, line.bars[0]!),
  );
});

test('a held note crossing the viewing boundary is clipped without changing source duration', () => {
  const note = { pitch: 60, at: 1800, len: 480, groups: ['rh', '1'] };
  const line = scoreLines([note, { ...note, pitch: 72 }], 3840, layout)[1]!;
  assert.deepEqual(notePlacement(note, line, line.bars[0]!), {
    gridRow: 13,
    gridColumn: '1 / -1',
    left: '0%',
    width: '18.75%',
  });
  assert.equal(note.len, 480);
});

test('notation geometry uses the supplied tick resolution', () => {
  const note = { pitch: 60, at: 240, len: 240, groups: ['rh', '1'] };
  const line = scoreLines([note, { ...note, pitch: 72 }], 960, {
    ...layout,
    ppq: 240,
    meters: [{ at: 0, meter: '4/4' }],
  })[0]!;
  assert.deepEqual(notePlacement(note, line, line.bars[0]!), {
    gridRow: 13,
    gridColumn: '1 / -1',
    left: '25%',
    width: '25%',
  });
});

test('score lines break at measure boundaries and crop each line to its sounding pitches', () => {
  const notes = [
    { pitch: 60, at: 0, len: 480, groups: [] },
    { pitch: 77, at: 1920, len: 480, groups: [] },
    { pitch: 48, at: 3840, len: 960, groups: [] },
    { pitch: 36, at: 7680, len: 1920, groups: [] },
    { pitch: 72, at: 7680, len: 1920, groups: [] },
  ];
  const lines = scoreLines(notes, 9600, { ...layout, width: 1024 });
  assert.deepEqual(
    lines.map(({ from, to }) => ({ from, to })),
    [
      { from: 0, to: 3840 },
      { from: 3840, to: 7680 },
      { from: 7680, to: 9600 },
    ],
  );
  assert.equal(lines[0]!.rows.at(-1), 60);
  assert.equal(lines[0]!.rows[0], 77);
  assert.equal(lines.at(-1)!.rows.at(-1), 36);
  assert.equal(lines.at(-1)!.rows[0], 72);
  assert.deepEqual(
    [...new Set(lines.flatMap((line) => line.notes.map(({ index }) => index)))].sort(
      (a, b) => a - b,
    ),
    [0, 1, 2, 3, 4],
  );
});

test('notes held across a line break keep their identity and contribute to both pitch ranges', () => {
  const held = { pitch: 48, at: 1440, len: 960, groups: ['lh', '3'] };
  const upper = { pitch: 76, at: 1920, len: 480, groups: ['rh', '1'] };
  const lines = scoreLines([held, upper], 3840, layout);
  assert.equal(lines[0]!.notes[0]!.note, held);
  assert.equal(lines[1]!.notes[0]!.note, held);
  assert.equal(lines[0]!.notes[0]!.index, lines[1]!.notes[0]!.index);
  assert.deepEqual(lines[0]!.rows, [48]);
  assert.equal(lines[1]!.rows.at(-1), 48);
  assert.equal(lines[1]!.rows[0], 76);
  assert.deepEqual(notePlacement(held, lines[0]!, lines[0]!.bars[0]!), {
    gridRow: 1,
    gridColumn: '1 / -1',
    left: '75%',
    width: '25%',
  });
  assert.deepEqual(notePlacement(held, lines[1]!, lines[1]!.bars[0]!), {
    gridRow: 29,
    gridColumn: '1 / -1',
    left: '0%',
    width: '25%',
  });
  assert.equal(held.len, 960);
});

test('changing line width changes wrapping without changing notes or elapsed time', () => {
  const notes = [
    { pitch: 48, at: 1440, len: 2880, groups: [] },
    { pitch: 76, at: 5760, len: 1920, groups: [] },
  ];
  const totalTicks = 7680;
  const original = structuredClone(notes);
  for (const barsPerLine of [1, 2, 3, 4]) {
    const lines = scoreLines(notes, totalTicks, { ...layout, width: 512 * barsPerLine });
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
  assert.deepEqual(notes, original);
});

test('a silent measure keeps its place between sounding measures', () => {
  const notes = [
    { pitch: 60, at: 0, len: 480, groups: ['rh', '1'] },
    { pitch: 72, at: 3840, len: 480, groups: ['rh', '1'] },
  ];
  const lines = scoreLines(notes, 5760, { ...layout, foldThreshold: 12 });
  assert.equal(lines.length, 3);
  assert.equal(lines[1]!.notes.length, 0);
  assert.equal(lines[1]!.from, 1920);
  assert.deepEqual(lines[1]!.rows, [60]);
});

test('pitch gaps fold at the configured threshold and zero disables folding', () => {
  assert.deepEqual(pitchRows([60, 73], 12), [73, { from: 61, to: 72 }, 60]);
  const unfolded = Array.from({ length: 14 }, (_, index) => 73 - index);
  assert.deepEqual(pitchRows([60, 73], 13), unfolded);
  assert.deepEqual(pitchRows([60, 73], 0), unfolded);
});

test('each large pitch gap folds while smaller intervals retain semitone spacing', () => {
  const pitches = [48, 72, 36, 67, 64, 72];
  assert.deepEqual(pitchRows(pitches, 6), [
    72,
    71,
    70,
    69,
    68,
    67,
    66,
    65,
    64,
    { from: 49, to: 63 },
    48,
    { from: 37, to: 47 },
    36,
  ]);
  assert.deepEqual(pitches, [48, 72, 36, 67, 64, 72]);
});

test('folding includes every pitch used anywhere in the line and carried held notes', () => {
  const notes = [
    { pitch: 48, at: 1440, len: 960, groups: ['lh', '3'] },
    { pitch: 60, at: 1920, len: 120, groups: ['lh', '2'] },
    { pitch: 76, at: 2400, len: 480, groups: ['rh', '1'] },
  ];
  const lines = scoreLines(notes, 3840, { ...layout, foldThreshold: 12 });
  assert.deepEqual(lines[0]!.rows, [48]);
  assert.deepEqual(lines[1]!.rows, [
    76,
    { from: 61, to: 75 },
    60,
    59,
    58,
    57,
    56,
    55,
    54,
    53,
    52,
    51,
    50,
    49,
    48,
  ]);
  assert.equal(lines[1]!.notes[0]!.note, notes[0]);
  assert.deepEqual(notePlacement(notes[0]!, lines[1]!, lines[1]!.bars[0]!), {
    gridRow: 15,
    gridColumn: '1 / -1',
    left: '0%',
    width: '25%',
  });
  for (const { note, index } of lines[1]!.notes) {
    assert.equal(note, notes[index]);
    assert(lines[1]!.rows.includes(note.pitch));
  }
});
