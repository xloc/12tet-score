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

export type PitchRow = number | { from: number; to: number };

export type ScoreBar = { from: number; to: number; left: number; width: number };
export type ScoreGeometry = { width: number; bars: ScoreBar[] };
export type ScoreLine = {
  from: number;
  to: number;
  minimum: number;
  maximum: number | undefined;
  bars: { from: number; to: number; minimum: number; preferred: number }[];
  beats: { from: number; to: number; bar: number; number: number }[];
  notes: { note: Note; index: number }[];
  rows: PitchRow[];
  bands: { from: number; to: number }[];
};

export type ScoreLayout = {
  ppq: number;
  ticksPerBar: number;
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
  { ppq, ticksPerBar, width: viewportWidth, rem, foldThreshold, variableBarWidth }: ScoreLayout,
): ScoreLine[] {
  const indexedNotes = notes.map((note, index) => ({ note, index }));
  const normalWidth = (ticksPerBar / ppq) * 8 * rem;
  const availableWidth = viewportWidth || normalWidth;
  const barsPerLine = Math.max(1, Math.floor(availableWidth / normalWidth));
  const bars = Array.from({ length: Math.ceil(totalTicks / ticksPerBar) }, (_, index) => {
    const from = index * ticksPerBar;
    const to = Math.min(from + ticksPerBar, totalTicks);
    const duration = to - from;
    if (!variableBarWidth) {
      const width = (duration / ticksPerBar) * (availableWidth / barsPerLine);
      return { from, to, minimum: width, preferred: width };
    }
    const sounding = notes.filter((note) => note.at < to && note.at + note.len > from);
    const events = [
      ...new Set([
        from,
        to,
        ...sounding.flatMap((note) => [Math.max(from, note.at), Math.min(to, note.at + note.len)]),
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
    return { from, to, minimum, preferred };
  });
  const groups: (typeof bars)[] = [];
  let group: typeof bars = [];
  let minimumWidth = 0;
  for (const bar of bars) {
    if (
      group.length &&
      (variableBarWidth
        ? minimumWidth + bar.minimum > availableWidth
        : group.length === barsPerLine)
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
      !variableBarWidth || index === groups.length - 1
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
      beats: group.flatMap((bar) =>
        Array.from({ length: Math.ceil((bar.to - bar.from) / ppq) }, (_, index) => ({
          from: bar.from + index * ppq,
          to: Math.min(bar.from + (index + 1) * ppq, bar.to),
          bar: 1 + Math.floor(bar.from / ticksPerBar),
          number: index + 1,
        })),
      ),
      notes: lineNotes,
      rows,
      bands,
    };
  });
}

export function positionAtTick(tick: number, bars: ScoreBar[]) {
  const bar = bars.find((bar) => tick < bar.to) ?? bars.at(-1)!;
  const fraction = Math.max(0, Math.min(1, (tick - bar.from) / (bar.to - bar.from)));
  return bar.left + fraction * bar.width;
}

export function tickAtPosition(position: number, bars: ScoreBar[]) {
  const bar = bars.find((bar) => position < bar.left + bar.width) ?? bars.at(-1)!;
  const fraction = Math.max(0, Math.min(1, (position - bar.left) / bar.width));
  return bar.from + fraction * (bar.to - bar.from);
}

export function timePlacement(from: number, to: number, line: ScoreGeometry) {
  const left = positionAtTick(from, line.bars);
  const right = positionAtTick(to, line.bars);
  return {
    left: `${(left / line.width) * 100}%`,
    width: `${((right - left) / line.width) * 100}%`,
  };
}

export function notePlacement(note: Note, line: ScoreLine, geometry: ScoreGeometry | undefined) {
  return {
    gridRow: line.rows.indexOf(note.pitch) + 1,
    gridColumn: '1 / -1',
    ...(geometry ? timePlacement(note.at, note.at + note.len, geometry) : {}),
  };
}
