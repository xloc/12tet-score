export type Note = {
  pitch: number;
  at: number;
  len: number;
  groups: string[];
  finger?: 1 | 2 | 3 | 4 | 5;
  text?: string;
};

export type NoteGroup = { id: string; name: string } & (
  | { kind: 'hand'; hand: 'left' | 'right' }
  | { kind: 'voice' }
);
export type Meter = { at: number; meter: string };
export type Tempo = { at: number; bpm: number };
export type Annotation = { at: number; len?: number; text: string };
export type Chord = { at: number; len: number; root: string; type: string; bass?: string };
export type PitchGuide = { at: number; len: number; text?: string } & (
  | { pitchClasses: number[]; pitches?: never }
  | { pitches: number[]; pitchClasses?: never }
);
export type Pedal = {
  at: number;
  len: number;
  type: 'sustain' | 'sostenuto' | 'soft';
  text?: string;
};
export type Section = { at: number; title: string; text?: string };

export type Score = {
  title: string;
  composer: string;
  collection: string;
  ppq: number;
  tempos: Tempo[];
  meters: Meter[];
  source: { name: string; url: string; scoreUrl: string; license: string; reference: string };
  groups: NoteGroup[];
  notes: Note[];
  annotations: Annotation[];
  chords: Chord[];
  pitchGuides: PitchGuide[];
  pedals: Pedal[];
  sections: Section[];
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

export function chordLabel(chord: Pick<Chord, 'root' | 'type' | 'bass'>) {
  const type = chord.type === 'major' ? '' : chord.type === 'minor' ? 'm' : chord.type;
  return `${chord.root}${type}${chord.bass ? `/${chord.bass}` : ''}`;
}

export function scoreDuration(score: Score) {
  return Math.max(
    0,
    ...[
      ...score.notes,
      ...score.annotations,
      ...score.chords,
      ...score.pitchGuides,
      ...score.pedals,
      ...score.sections,
      ...score.meters,
      ...score.tempos,
    ].map((item) => item.at + ('len' in item ? (item.len ?? 0) : 0)),
  );
}
