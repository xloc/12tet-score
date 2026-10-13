import type { Pinia } from 'pinia';
import type { Meter, Note, Score } from '../../src/music';
import type { MusicSelection } from '../../src/selection';
import type { ScoreLine } from '../../src/layout';
import { useScoreStore } from '../../src/stores/score';

export function createScoreStore(pinia: Pinia, score: Score) {
  const sheet = useScoreStore(pinia);
  sheet.load(score);
  return sheet;
}

export function createScore(overrides: Partial<Score> = {}): Score {
  return {
    title: 'Test score',
    composer: 'Test composer',
    collection: '',
    ppq: 480,
    tempos: [{ at: 0, bpm: 60 }],
    meters: [{ at: 0, meter: '4/4' }],
    source: { name: 'Test fixture', url: '', scoreUrl: '', license: '', reference: '' },
    groups: [],
    notes: [],
    annotations: [],
    chords: [],
    pitchGuides: [],
    pedals: [],
    sections: [],
    ...overrides,
  };
}

export function practiceScore(...bars: number[][][]): Score {
  return createScore({
    ppq: 1,
    tempos: [{ at: 0, bpm: 80 }],
    notes: bars.flatMap((events, bar) =>
      events.flatMap((pitches, index) =>
        pitches.map((pitch) => ({
          pitch,
          at: bar * 4 + index,
          len: index === events.length - 1 ? 4 - index : 1,
          groups: [],
        })),
      ),
    ),
  });
}

export const distantScore = practiceScore(
  [[60], [62], [64], [65]],
  [[67], [69], [71], [72]],
  [[73], [75], [78], [80]],
  [[82], [84], [86], [88]],
  [[48], [50], [52], [53]],
  [[55], [57], [59], [60]],
);

export function notationProps(options: {
  notes: Note[];
  ppq: number;
  meters: Meter[];
  totalTicks: number;
  foldThreshold: number;
  variableBarWidth: boolean;
  playhead: number;
  playing: boolean;
  selection: MusicSelection;
}) {
  const { notes, ppq, meters, ...rest } = options;
  return {
    ...rest,
    score: createScore({ notes, ppq, meters }),
  };
}

// Fixed browser-size fixtures for geometry tests; no flex allocation is simulated.
export function fixedGeometry(
  line: ScoreLine,
  widths: number[] = line.bars.map((bar) => bar.preferred),
) {
  let left = 0;
  const bars = line.bars.map((bar, index) => {
    const width = widths[index]!;
    const result = { from: bar.from, to: bar.to, left, width };
    left += width;
    return result;
  });
  return { width: left, bars };
}

export function positionAtTick(tick: number, bars: ReturnType<typeof fixedGeometry>['bars']) {
  const bar = bars.find((bar) => tick < bar.to) ?? bars.at(-1)!;
  return bar.left + Math.max(0, Math.min(1, (tick - bar.from) / (bar.to - bar.from))) * bar.width;
}
