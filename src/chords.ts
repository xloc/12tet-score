import { pitchNames, type Note } from './music.ts';

// Exact pitch-class matches, independent of octave, doubling, and note order.
const patterns: { suffix: string; intervals: number[] }[] = [
  { suffix: '', intervals: [0, 4, 7] },
  { suffix: 'm', intervals: [0, 3, 7] },
  { suffix: 'dim', intervals: [0, 3, 6] },
  { suffix: 'aug', intervals: [0, 4, 8] },
  { suffix: 'sus2', intervals: [0, 2, 7] },
  { suffix: 'sus4', intervals: [0, 5, 7] },
  { suffix: '7', intervals: [0, 4, 7, 10] },
  { suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { suffix: 'm7', intervals: [0, 3, 7, 10] },
  { suffix: 'm7b5', intervals: [0, 3, 6, 10] },
  { suffix: 'dim7', intervals: [0, 3, 6, 9] },
  { suffix: '6', intervals: [0, 4, 7, 9] },
  { suffix: 'm6', intervals: [0, 3, 7, 9] },
];

export function chordNames(notes: Note[]) {
  const pitches = new Set(notes.map((note) => note.pitch % 12));
  return [...pitches]
    .sort((a, b) => a - b)
    .flatMap((root) =>
      patterns
        .filter(
          (pattern) =>
            pattern.intervals.length === pitches.size &&
            pattern.intervals.every((interval) => pitches.has((root + interval) % 12)),
        )
        .map((pattern) => `${pitchNames[root]}${pattern.suffix}`),
    );
}
