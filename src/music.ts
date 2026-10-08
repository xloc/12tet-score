import importedScore from './scores/bwv846-prelude.json' with { type: 'json' };

export type Note = {
  pitch: number;
  at: number;
  len: number;
  voice: number;
};

export type Score = {
  title: string;
  composer: string;
  collection: string;
  ppq: number;
  bpm: number;
  meter: number[];
  source: { name: string; url: string; scoreUrl: string; license: string; reference: string };
  voices: { id: number; name: string }[];
  notes: Note[];
  annotations: { at: number; len: number; kind: string; text: string }[];
};

export const score: Score = importedScore;
export const totalTicks = Math.max(...score.notes.map((note) => note.at + note.len));
export const ticksPerBar = (score.ppq * score.meter[0]! * 4) / score.meter[1]!;
export const barCount = Math.ceil(totalTicks / ticksPerBar);
export const pitchNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function pitchLabel(pitch: number) {
  const octave = Math.floor(pitch / 12) - 1;
  return `${pitchNames[pitch % 12]}${octave}`;
}

export function seconds(ticks: number, bpm: number) {
  return ((ticks / score.ppq) * 60) / bpm;
}

export function notePlacement(
  note: Note,
  from: number,
  to: number,
  highestPitch: number,
  ppq: number,
) {
  const cell = ppq / 4;
  const start = Math.max(note.at, from);
  const end = Math.min(note.at + note.len, to);
  return {
    gridRow: highestPitch - note.pitch + 2,
    gridColumn: `${2 + (start - from) / cell} / span ${(end - start) / cell}`,
  };
}
