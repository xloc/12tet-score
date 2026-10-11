import type { Rect } from './selection';

export const pitchLabelSearchBudget = 100_000;

export function placePitchLabels(
  notes: { bar: Rect; width: number; height: number }[],
  width: number,
  height: number,
  obstacles: Rect[] = [],
  extendBelow = false,
  budget: { remaining: number } = { remaining: pitchLabelSearchBudget },
) {
  const horizontalGap = 1;
  const verticalGap = 2;
  const occupied = [...notes.map(({ bar }) => bar), ...obstacles];
  const searchHeights = [height];
  if (extendBelow)
    searchHeights.push(
      height + notes.reduce((sum, note) => sum + note.height + verticalGap * 2, 0),
    );
  // Bound scan steps and collision checks per label and across the full layout.
  return notes.map(({ bar, width: labelWidth, height: labelHeight }) => {
    const left = Math.max(0, Math.min(bar.left, width - labelWidth));
    const lastLeft = Math.max(left, Math.min(bar.right - labelWidth, width - labelWidth));
    let label: Rect | undefined;
    let labelBudget = 16_384;
    function searchStep() {
      if (labelBudget === 0 || budget.remaining === 0) return false;
      labelBudget--;
      budget.remaining--;
      return true;
    }
    search: for (const searchHeight of searchHeights) {
      for (let distance = 0; distance < searchHeight; distance += verticalGap) {
        if (!searchStep()) break search;
        for (const top of [
          bar.top - labelHeight - verticalGap - distance,
          bar.bottom + verticalGap + distance,
        ]) {
          if (top < 0 || top + labelHeight > searchHeight) continue;
          let x = left;
          while (x <= lastLeft) {
            if (!searchStep()) break search;
            const candidate = { left: x, top, right: x + labelWidth, bottom: top + labelHeight };
            let blocked = false;
            for (const other of occupied) {
              if (!searchStep()) break search;
              if (
                candidate.left < other.right + horizontalGap &&
                candidate.right > other.left - horizontalGap &&
                candidate.top < other.bottom + verticalGap &&
                candidate.bottom > other.top - verticalGap
              ) {
                x = other.right + horizontalGap;
                blocked = true;
                break;
              }
            }
            if (blocked) continue;
            label = candidate;
            break search;
          }
        }
      }
    }
    // Accept overlap above the note when no clear position is found within the budget.
    label ??= {
      left,
      top: Math.max(0, bar.top - labelHeight - verticalGap),
      right: left + labelWidth,
      bottom: Math.max(0, bar.top - labelHeight - verticalGap) + labelHeight,
    };
    occupied.push(label);
    return label;
  });
}
