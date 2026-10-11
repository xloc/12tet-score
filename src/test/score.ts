import { readFileSync } from 'node:fs';
import { createPinia, type Pinia } from 'pinia';
import type { Meter, Note, Score } from '../music';
import type { MusicSelection } from '../selection';
import type { ScoreLine } from '../layout';
import { useScoreStore } from '../stores/score';

export const score: Score = JSON.parse(
  readFileSync(new URL('../../public/scores/bwv846-prelude.json', import.meta.url), 'utf8'),
);

export function createScoreStore(pinia: Pinia = createPinia()) {
  const sheet = useScoreStore(pinia);
  sheet.load(score);
  return sheet;
}

export const { totalTicks, barCount } = createScoreStore();
export const ticksPerBar = 1920;

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
    score: {
      ...score,
      notes,
      ppq,
      meters,
      annotations: [],
      chords: [],
      pitchGuides: [],
      pedals: [],
      sections: [],
    },
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
