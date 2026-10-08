import { readFileSync } from 'node:fs';
import { createPinia, type Pinia } from 'pinia';
import type { Score } from '../music';
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

export const { totalTicks, ticksPerBar, barCount } = createScoreStore();

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
