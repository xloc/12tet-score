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

export type ScoreEntry = Pick<Score, 'title' | 'composer'> & { file: string };

export const pitchNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function pitchLabel(pitch: number) {
  const octave = Math.floor(pitch / 12) - 1;
  return `${pitchNames[pitch % 12]}${octave}`;
}

export function seconds(ticks: number, bpm: number, ppq: number) {
  return ((ticks / ppq) * 60) / bpm;
}
