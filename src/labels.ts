import type { Rect } from './selection';

export function placePitchLabels(
  notes: { bar: Rect; width: number; height: number }[],
  width: number,
  height: number,
  obstacles: Rect[] = [],
  minTop = 0,
) {
  const horizontalGap = 1;
  const verticalGap = 2;
  const occupied = [...notes.map(({ bar }) => bar), ...obstacles];
  const labels: Rect[] = [];
  const ordered = notes
    .map((note, index) => ({ ...note, index }))
    .sort((a, b) => b.height - a.height || a.bar.top - b.bar.top || a.bar.left - b.bar.left);
  // Reserve space for multiline and upper labels before smaller labels can displace them.
  for (const { bar, width: labelWidth, height: labelHeight, index } of ordered) {
    const left = Math.max(0, Math.min(bar.left, width - labelWidth));
    const above = bar.top - labelHeight - verticalGap;
    const below = bar.bottom + verticalGap;
    const maxLeft = Math.max(
      left,
      Math.min(bar.right - labelWidth, width - labelWidth, left + labelWidth),
    );
    const minY = Math.max(minTop, above - labelHeight * 2);
    const maxY = Math.min(height - labelHeight, below + labelHeight * 2);
    const nearby = occupied.filter(
      (other) =>
        left < other.right + horizontalGap &&
        maxLeft + labelWidth > other.left - horizontalGap &&
        minY < other.bottom + verticalGap &&
        maxY + labelHeight > other.top - verticalGap,
    );
    const columns = [
      ...new Set([
        left,
        maxLeft,
        ...nearby.flatMap((other) => [
          other.left - labelWidth - horizontalGap,
          other.right + horizontalGap,
        ]),
      ]),
    ]
      .filter((column) => column >= left && column <= maxLeft)
      .sort((a, b) => a - b);
    const verticalDistance = (row: number) =>
      Math.min(Math.abs(row - above), Math.abs(row - below));
    const rows = [
      ...new Set([
        above,
        below,
        minY,
        maxY,
        ...nearby.flatMap((other) => [
          other.top - labelHeight - verticalGap,
          other.bottom + verticalGap,
        ]),
      ]),
    ]
      .filter((row) => row >= minY && row <= maxY)
      .sort((a, b) => verticalDistance(a) - verticalDistance(b) || a - b);
    const collides = (column: number, row: number, other: Rect) =>
      column < other.right + horizontalGap &&
      column + labelWidth > other.left - horizontalGap &&
      row < other.bottom + verticalGap &&
      row + labelHeight > other.top - verticalGap;
    let x = left;
    let top: number | undefined;
    let previousRange = -1;
    let nearest = Infinity;
    // Expand the same two-dimensional search; each candidate is tested only once.
    search: for (const range of [0, 0.5, 1, 2]) {
      for (const row of rows) {
        for (const column of columns) {
          const distance = Math.max(
            (column - left) / labelWidth,
            verticalDistance(row) / labelHeight,
          );
          if (distance <= previousRange || distance > range || distance >= nearest) continue;
          if (nearby.some((other) => collides(column, row, other))) continue;
          x = column;
          top = row;
          nearest = distance;
          if (distance === 0) break search;
        }
      }
      if (top !== undefined) break;
      previousRange = range;
    }
    if (top === undefined) {
      // Overflow safely below this roll, jumping over occupied rectangles at the original x.
      top = height + verticalGap;
      const blockers = occupied
        .filter(
          (other) =>
            left < other.right + horizontalGap && left + labelWidth > other.left - horizontalGap,
        )
        .sort((a, b) => a.top - b.top);
      for (const other of blockers) {
        if (collides(left, top, other)) top = other.bottom + verticalGap;
      }
    }
    const label = { left: x, top, right: x + labelWidth, bottom: top + labelHeight };
    occupied.push(label);
    labels[index] = label;
  }
  return labels;
}
