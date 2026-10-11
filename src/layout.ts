import { pitchLabel, type Meter, type Note, type Section } from './music';
import { scoreBars } from './timing';

export type PitchRow = number | { from: number; to: number };

export type ScoreBar = {
  from: number;
  to: number;
  minimum: number;
  preferred: number;
  number: number;
  meter: string;
  notes: { note: Note; index: number }[];
  beats: { from: number; to: number; number: number; bar: number }[];
};
export type ScoreLine = {
  from: number;
  to: number;
  minimum: number;
  maximum: number | undefined;
  bars: ScoreBar[];
  notes: { note: Note; index: number }[];
  rows: PitchRow[];
  bands: { from: number; to: number }[];
};

export type ScoreLayout = {
  ppq: number;
  meters: Meter[];
  sections?: Section[];
  width: number;
  rem: number;
  foldThreshold: number;
  variableBarWidth: boolean;
};

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
  {
    ppq,
    meters,
    sections = [],
    width: viewportWidth,
    rem,
    foldThreshold,
    variableBarWidth,
  }: ScoreLayout,
): ScoreLine[] {
  const indexedNotes = notes.map((note, index) => ({ note, index }));
  const [numerator, denominator] = meters[0]!.meter.split('/').map(Number);
  const ticksPerBar = (ppq * numerator! * 4) / denominator!;
  const normalWidth = (ticksPerBar / ppq) * 8 * rem;
  const availableWidth = viewportWidth || normalWidth;
  const barsPerLine = Math.max(1, Math.floor(availableWidth / normalWidth));
  const bars = scoreBars(totalTicks, ppq, meters, sections).map(
    ({ from, to, number, meter, beatTicks }) => {
      const duration = to - from;
      const barNotes = indexedNotes.filter(({ note }) => note.at < to && note.at + note.len > from);
      const beats = Array.from({ length: Math.ceil(duration / beatTicks) }, (_, beat) => ({
        from: from + beat * beatTicks,
        to: Math.min(from + (beat + 1) * beatTicks, to),
        bar: number,
        number: beat + 1,
      }));
      if (!variableBarWidth) {
        const width = (duration / ticksPerBar) * (availableWidth / barsPerLine);
        return {
          from,
          to,
          number,
          meter,
          minimum: width,
          preferred: width,
          notes: barNotes,
          beats,
        };
      }
      const sounding = barNotes.map(({ note }) => note);
      const events = [
        ...new Set([
          from,
          to,
          ...sounding.flatMap((note) => [
            Math.max(from, note.at),
            Math.min(to, note.at + note.len),
          ]),
        ]),
      ].sort((a, b) => a - b);
      const shortest = Math.min(...events.slice(1).map((at, index) => at - events[index]!));
      const minimum = Math.max(
        (duration / ppq) * 1.5 * rem,
        (duration / shortest) * 1.5 * rem,
        ...sounding.map(
          (note) =>
            (duration / Math.min(note.len, duration)) *
            (pitchLabel(note.pitch).length * 0.5 + 0.25) *
            rem,
        ),
      );
      const preferred = Math.max(
        minimum,
        (duration / ppq) * 2 * rem,
        (duration / shortest) * 2 * rem,
      );
      return { from, to, number, meter, minimum, preferred, notes: barNotes, beats };
    },
  );
  const groups: (typeof bars)[] = [];
  let group: typeof bars = [];
  let minimumWidth = 0;
  for (const bar of bars) {
    if (
      group.length &&
      (minimumWidth + bar.minimum > availableWidth + 0.001 ||
        sections.some((section) => section.at === bar.from))
    ) {
      groups.push(group);
      group = [];
      minimumWidth = 0;
    }
    group.push(bar);
    minimumWidth += bar.minimum;
  }
  if (group.length) groups.push(group);

  return groups.map((group, index) => {
    const from = group[0]!.from;
    const to = group.at(-1)!.to;
    const minimum = group.reduce((sum, bar) => sum + bar.minimum, 0);
    const maximum =
      !variableBarWidth ||
      index === groups.length - 1 ||
      sections.some((section) => section.at === groups[index + 1]?.[0]?.from)
        ? group.reduce((sum, bar) => sum + bar.preferred, 0)
        : undefined;
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
      minimum,
      maximum,
      bars: group,
      notes: lineNotes,
      rows,
      bands,
    };
  });
}

export function barPosition(tick: number, bar: Pick<ScoreBar, 'from' | 'to'>) {
  return Math.max(0, Math.min(1, (tick - bar.from) / (bar.to - bar.from)));
}

export function timePlacement(from: number, to: number, bar: Pick<ScoreBar, 'from' | 'to'>) {
  const left = barPosition(from, bar);
  return { left: `${left * 100}%`, width: `${(barPosition(to, bar) - left) * 100}%` };
}

export function notePlacement(note: Note, line: ScoreLine, bar: ScoreBar) {
  return {
    gridRow: line.rows.indexOf(note.pitch) + 1,
    gridColumn: '1 / -1',
    ...timePlacement(note.at, note.at + note.len, bar),
  };
}
