import { readFileSync } from 'node:fs';
import { createPinia, type Pinia } from 'pinia';
import type { Score } from '../music';
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
