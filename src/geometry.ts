import type { ScoreGeometry } from './music';

export function measureScoreLine(element: HTMLElement): ScoreGeometry {
  const rect = element.getBoundingClientRect();
  return {
    width: rect.width,
    bars: Array.from(element.querySelectorAll<HTMLElement>('[data-score-bar]')).map((bar) => {
      const bounds = bar.getBoundingClientRect();
      return {
        from: Number(bar.dataset.barFrom),
        to: Number(bar.dataset.barTo),
        left: bounds.left - rect.left,
        width: bounds.width,
      };
    }),
  };
}
