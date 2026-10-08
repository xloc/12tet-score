import type { Rect } from './selection';

export function placePitchLabels(
  notes: { bar: Rect; width: number; height: number }[],
  width: number,
  height: number,
  obstacles: Rect[] = [],
) {
  const gap = 2;
  const occupied = [...notes.map(({ bar }) => bar), ...obstacles];
  return notes.map(({ bar, width: labelWidth, height: labelHeight }) => {
    const left = Math.max(0, Math.min(bar.left, width - labelWidth));
    const lastLeft = Math.max(left, Math.min(bar.right - labelWidth, width - labelWidth));
    let label: Rect | undefined;
    for (let distance = 0; distance < height && !label; distance += gap) {
      for (const top of [bar.top - labelHeight - gap - distance, bar.bottom + gap + distance]) {
        if (top < 0 || top + labelHeight > height) continue;
        for (let x = left; x <= lastLeft; x += labelWidth + gap) {
          const candidate = { left: x, top, right: x + labelWidth, bottom: top + labelHeight };
          if (
            occupied.some(
              (other) =>
                candidate.left < other.right + gap &&
                candidate.right > other.left - gap &&
                candidate.top < other.bottom + gap &&
                candidate.bottom > other.top - gap,
            )
          ) {
            continue;
          }
          label = candidate;
          break;
        }
        if (label) break;
      }
    }
    // Keep every pitch visible even when a dense passage has no clear space.
    label ??= {
      left,
      top: Math.max(0, bar.top - labelHeight - gap),
      right: left + labelWidth,
      bottom: Math.max(0, bar.top - labelHeight - gap) + labelHeight,
    };
    occupied.push(label);
    return label;
  });
}
