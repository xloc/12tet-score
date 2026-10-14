import { expect, test } from 'vite-plus/test';
import { performedNotes } from '../src/ornaments';
import type { Note, Ornament, PlayedNote } from '../src/music';
import { createScore } from './helpers/score';

const main: Note = {
  pitch: 60,
  at: 960,
  len: 480,
  groups: ['rh', 'melody'],
  finger: 3,
  text: 'Stress this note',
};
const groups = [
  { id: 'rh', kind: 'hand' as const, hand: 'right' as const, name: 'Right hand' },
  { id: 'melody', kind: 'voice' as const, name: 'Melody' },
  { id: 'inner', kind: 'voice' as const, name: 'Inner voice' },
];
function score(ornament: Ornament, before: Note[] = [], overrides: Partial<Note> = {}) {
  return createScore({ groups, notes: [...before, { ...main, ...overrides, ornament }] });
}
function times(notes: PlayedNote[]) {
  return notes.map(({ pitch, at, len }) => [pitch, at, len]);
}

test('old flat grace data is rejected instead of becoming ordinary matching evidence', () => {
  const legacy = JSON.parse('{"pitch":62,"at":0,"len":30,"groups":[],"grace":true,"anchor":0}');
  expect(() => performedNotes(createScore({ notes: [legacy] }))).toThrow(
    /main note’s ornament field/,
  );
});

test.each([
  {
    timing: 'beforeStart' as const,
    expected: [
      [62, 840, 60],
      [64, 900, 60],
      [60, 960, 480],
    ],
  },
  {
    timing: 'atStart' as const,
    expected: [
      [62, 960, 60],
      [64, 1020, 60],
      [60, 1080, 360],
    ],
  },
  {
    timing: 'beforeEnd' as const,
    expected: [
      [60, 960, 360],
      [62, 1320, 60],
      [64, 1380, 60],
    ],
  },
])('$timing uses the original main interval without mutating it', ({ timing, expected }) => {
  const source = score({ timing, pitches: [62, 64], len: 120 });
  const snapshot = structuredClone(source);
  Object.freeze(source.notes[0]);
  const notes = performedNotes(source);
  expect(times(notes)).toEqual(expected);
  expect(source).toEqual(snapshot);
  expect(notes.every((note) => note.source === source.notes[0])).toBe(true);
  expect(notes.find((note) => !note.grace)).toMatchObject({ finger: 3, text: 'Stress this note' });
  expect(notes.filter((note) => note.grace).every((note) => !note.finger && !note.text)).toBe(true);
});

test('defaults count steps rather than pitches and compress to half a short main note', () => {
  const ornament: Ornament = { timing: 'atStart', pitches: [62, [60, 64], 62] };
  expect(times(performedNotes(score(ornament)))).toEqual([
    [62, 960, 30],
    [60, 990, 30],
    [64, 990, 30],
    [62, 1020, 30],
    [60, 1050, 390],
  ]);
  expect(times(performedNotes(score(ornament, [], { len: 120 })))).toEqual([
    [62, 960, 20],
    [60, 980, 20],
    [64, 980, 20],
    [62, 1000, 20],
    [60, 1020, 60],
  ]);
});

test('rhythm weights distribute the total across simultaneous steps', () => {
  const notes = performedNotes(
    score({ timing: 'atStart', pitches: [62, [60, 64], 62], len: 120, rhythm: [2, 1, 1] }),
  );
  expect(times(notes)).toEqual([
    [62, 960, 60],
    [60, 1020, 30],
    [64, 1020, 30],
    [62, 1050, 30],
    [60, 1080, 360],
  ]);
});

test('cumulative rounding preserves the group length, also with automatic timing', () => {
  for (const len of [undefined, 100]) {
    const notes = performedNotes(
      score({ timing: 'atStart', pitches: [62, 64, 62], len, rhythm: [1, 1, 1] }),
    );
    expect(notes.slice(0, 3).reduce((sum, note) => sum + note.len, 0)).toBe(len ?? 90);
    expect(
      notes.every(
        (note) => Number.isInteger(note.at) && Number.isInteger(note.len) && note.len > 0,
      ),
    ).toBe(true);
    expect(notes.at(-1)!.at + notes.at(-1)!.len).toBe(1440);
  }
});

test('explicit lengths can exceed half the main interval', () => {
  expect(times(performedNotes(score({ timing: 'atStart', pitches: [62], len: 360 })))).toEqual([
    [62, 960, 360],
    [60, 1320, 120],
  ]);
});

test('beforeStart uses rests first, then only the intended voice tail', () => {
  const ornament: Ornament = { timing: 'beforeStart', pitches: [62, 64], len: 120 };
  const inner: Note = { pitch: 55, at: 480, len: 960, groups: ['rh', 'inner'] };
  for (const len of [360, 420, 480]) {
    const previous = { ...main, at: 480, len };
    const source = score(ornament, [previous, inner]);
    const notes = performedNotes(source);
    expect(notes[0]!.len).toBe(360);
    expect(notes[1]!.len).toBe(960);
    expect(times(notes.slice(2))).toEqual([
      [62, 840, 60],
      [64, 900, 60],
      [60, 960, 480],
    ]);
    expect(previous.len).toBe(len);
  }
});

test('default borrowing preserves half the preceding tail and includes the available rest', () => {
  const previous = { ...main, at: 850, len: 100 };
  const notes = performedNotes(score({ timing: 'beforeStart', pitches: [62, 64, 62] }, [previous]));
  expect(times(notes)).toEqual([
    [60, 850, 50],
    [62, 900, 20],
    [64, 920, 20],
    [62, 940, 20],
    [60, 960, 480],
  ]);
});

test('an explicitly grouped preceding chord can donate time together', () => {
  const before = [60, 64, 67].map((pitch) => ({ ...main, pitch, at: 480, len: 480 }));
  const notes = performedNotes(score({ timing: 'beforeStart', pitches: [62], len: 120 }, before));
  expect(notes.slice(0, 3).map((note) => note.len)).toEqual([360, 360, 360]);
});

test('a hand alone does not identify which chord voice should donate time', () => {
  const before = [60, 64].map((pitch) => ({ pitch, at: 480, len: 480, groups: ['rh'] }));
  expect(() =>
    performedNotes(
      score({ timing: 'beforeStart', pitches: [62], len: 120 }, before, { groups: ['rh'] }),
    ),
  ).toThrow(/voice groups/);
});

test('opening beforeStart ornaments use a negative lead-in and preserve other voices', () => {
  const other = { pitch: 48, at: 0, len: 480, groups: ['lh'] };
  expect(
    times(
      performedNotes(
        score({ timing: 'beforeStart', pitches: [59, 62], len: 120 }, [other], { at: 0 }),
      ),
    ),
  ).toEqual([
    [48, 0, 480],
    [59, -120, 60],
    [62, -60, 60],
    [60, 0, 480],
  ]);
});

test('borrowing cannot overwrite a preceding end ornament', () => {
  const previous: Note = {
    ...main,
    at: 480,
    ornament: { timing: 'beforeEnd', pitches: [59, 60], len: 120 },
  };
  expect(() =>
    performedNotes(score({ timing: 'beforeStart', pitches: [62], len: 60 }, [previous])),
  ).toThrow(/available before/);
});

test.each([
  { timing: 'atStart', pitches: [62], len: 480 },
  { timing: 'beforeEnd', pitches: [62], len: 600 },
  { timing: 'atStart', pitches: [62], len: 0 },
  { timing: 'atStart', pitches: [62], len: 1.5 },
  { timing: 'atStart', pitches: [] },
  { timing: 'atStart', pitches: [[]] },
  { timing: 'atStart', pitches: [128] },
  { timing: 'atStart', pitches: [62, 64], rhythm: [1] },
  { timing: 'atStart', pitches: [62, 64], rhythm: [1, 0] },
  { timing: 'atStart', pitches: [62, 64], len: 1 },
] satisfies Ornament[])('invalid ornament is reported with its owner: %j', (ornament) => {
  expect(() => performedNotes(score(ornament))).toThrow(/Ornament on C4 at tick 960:/);
});

test('an explicit beforeStart length cannot erase its preceding note', () => {
  expect(() =>
    performedNotes(
      score({ timing: 'beforeStart', pitches: [62], len: 480 }, [{ ...main, at: 480 }]),
    ),
  ).toThrow(/only 479/);
});
