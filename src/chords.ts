import { detect } from '@tonaljs/chord-detect';
import { midiToNoteName } from '@tonaljs/midi';
import type { Note } from './music.ts';

export function chordNames(notes: Pick<Note, 'pitch'>[]) {
  // Tonal treats the first note as the bass.
  const pitches = notes
    .map((note) => note.pitch)
    .sort((a, b) => a - b)
    .map((pitch) => midiToNoteName(pitch, { sharps: true }));
  return detect(pitches);
}
