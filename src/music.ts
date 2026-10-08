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

export type PitchRow = number | { from: number; to: number };

export function pitchRows(pitches: number[], foldThreshold: number): PitchRow[] {
  const used = [...new Set(pitches)].sort((a, b) => b - a);
  const rows: PitchRow[] = [];
  for (const pitch of used) {
    const previous = rows.at(-1);
    if (typeof previous === 'number') {
      const gap = previous - pitch - 1;
      if (foldThreshold > 0 && gap >= foldThreshold) {
        rows.push({ from: pitch + 1, to: previous - 1 });
      } else {
        for (let missing = previous - 1; missing > pitch; missing--) rows.push(missing);
      }
    }
    rows.push(pitch);
  }
  return rows;
}

export function scoreLines(
  notes: Note[],
  totalTicks: number,
  ticksPerBar: number,
  barsPerLine: number,
  foldThreshold: number,
) {
  const indexedNotes = notes.map((note, index) => ({ note, index }));
  const ticksPerLine = ticksPerBar * barsPerLine;
  return Array.from({ length: Math.ceil(totalTicks / ticksPerLine) }, (_, index) => {
    const from = index * ticksPerLine;
    const to = Math.min(from + ticksPerLine, totalTicks);
    const lineNotes = indexedNotes.filter(({ note }) => note.at < to && note.at + note.len > from);
    const pitches = lineNotes.length ? lineNotes.map(({ note }) => note.pitch) : [60];
    const rows = pitchRows(pitches, foldThreshold);
    const bands = [{ from: 1, to: rows.length + 1 }];
    for (const [index, row] of rows.entries()) {
      if (typeof row === 'number') continue;
      bands.at(-1)!.to = index + 1;
      bands.push({ from: index + 2, to: rows.length + 1 });
    }
    return {
      from,
      to,
      notes: lineNotes,
      rows,
      bands,
    };
  });
}

export function notePlacement(note: Note, from: number, to: number, rows: PitchRow[], ppq: number) {
  const cell = ppq / 4;
  const start = Math.max(note.at, from);
  const end = Math.min(note.at + note.len, to);
  return {
    gridRow: rows.indexOf(note.pitch) + 1,
    gridColumn: `${1 + (start - from) / cell} / span ${(end - start) / cell}`,
  };
}
