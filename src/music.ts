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

export function scoreLines(
  notes: Note[],
  totalTicks: number,
  ticksPerBar: number,
  barsPerLine: number,
) {
  const indexedNotes = notes.map((note, index) => ({ note, index }));
  const ticksPerLine = ticksPerBar * barsPerLine;
  return Array.from({ length: Math.ceil(totalTicks / ticksPerLine) }, (_, index) => {
    const from = index * ticksPerLine;
    const to = Math.min(from + ticksPerLine, totalTicks);
    const lineNotes = indexedNotes.filter(({ note }) => note.at < to && note.at + note.len > from);
    const pitches = lineNotes.length ? lineNotes.map(({ note }) => note.pitch) : [60];
    return {
      from,
      to,
      notes: lineNotes,
      highestPitch: Math.max(...pitches),
      lowestPitch: Math.min(...pitches),
    };
  });
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
    gridRow: highestPitch - note.pitch + 1,
    gridColumn: `${1 + (start - from) / cell} / span ${(end - start) / cell}`,
  };
}
