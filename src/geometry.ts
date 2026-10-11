import { pitchLabelSearchBudget, placePitchLabels } from './labels';
import type { ScoreLine } from './layout';
import type { Rect, TimeLine } from './selection';

export function measureNotes(surface: HTMLElement, lines: ScoreLine[]) {
  const origin = surface.getBoundingClientRect();
  return Array.from(surface.querySelectorAll<HTMLElement>('[data-score-line]')).flatMap(
    (element, lineIndex) => {
      const fragments = new Map<number, HTMLElement[]>();
      for (const fragment of element.querySelectorAll<HTMLElement>('[data-note-index]')) {
        const index = Number(fragment.dataset.noteIndex);
        if (!fragments.has(index)) fragments.set(index, []);
        fragments.get(index)!.push(fragment);
      }
      const line = lines[lineIndex]!;
      return line.notes.map(({ index }) => {
        const elements = fragments.get(index)!;
        const rectangles = elements.map((element) => element.getBoundingClientRect());
        return {
          lineFrom: line.from,
          index,
          element: elements[0]!,
          bar: {
            left: Math.min(...rectangles.map((rect) => rect.left)) - origin.left,
            top: Math.min(...rectangles.map((rect) => rect.top)) - origin.top,
            right: Math.max(...rectangles.map((rect) => rect.right)) - origin.left,
            bottom: Math.max(...rectangles.map((rect) => rect.bottom)) - origin.top,
          },
        };
      });
    },
  );
}

export function measureTimeLines(surface: HTMLElement, lines: ScoreLine[]): TimeLine[] {
  const origin = surface.getBoundingClientRect();
  return Array.from(surface.querySelectorAll<HTMLElement>('[data-score-line]')).map(
    (element, index) => {
      const line = lines[index]!;
      const rect = element.getBoundingClientRect();
      const bars = Array.from(element.querySelectorAll<HTMLElement>('[data-score-bar]'));
      return {
        from: line.from,
        to: line.to,
        left: rect.left - origin.left,
        top: rect.top - origin.top,
        right: rect.right - origin.left,
        bottom: rect.bottom - origin.top,
        bars: line.bars.map((bar, index) => {
          const bounds = bars[index]!.getBoundingClientRect();
          return {
            from: bar.from,
            to: bar.to,
            left: bounds.left - origin.left,
            right: bounds.right - origin.left,
          };
        }),
      };
    },
  );
}

export type PitchLabelLayout = {
  label: { left: number; top: number };
  connector: { left: number; top: number; height: number };
};

export function layoutPitchLabels(surface: HTMLElement, lines: ScoreLine[]) {
  const bounds = surface.getBoundingClientRect();
  const notes = measureNotes(surface, lines).map((note) => {
    const label = note.element.querySelector<HTMLElement>('[data-pitch-label]')!;
    return { ...note, width: label.offsetWidth, height: label.offsetHeight };
  });
  const obstacles: Rect[] = Array.from(
    surface.querySelectorAll<HTMLElement>(
      '[data-pitch-fold], [data-time-label], [data-label-obstacle]',
    ),
  ).map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left - bounds.left,
      top: rect.top - bounds.top,
      right: rect.right - bounds.left,
      bottom: rect.bottom - bounds.top,
    };
  });
  const labels: Record<number, Record<number, PitchLabelLayout>> = {};
  const overflows: Record<number, number> = {};
  const searchBudget = { remaining: pitchLabelSearchBudget };
  for (const [lineIndex, element] of surface
    .querySelectorAll<HTMLElement>('[data-score-line]')
    .entries()) {
    const line = lines[lineIndex]!;
    const roll = element.querySelector<HTMLElement>('[data-piano-roll]')!.getBoundingClientRect();
    const left = roll.left - bounds.left;
    const top = roll.top - bounds.top;
    const bottom =
      Math.max(
        ...Array.from(element.querySelectorAll<HTMLElement>('[data-score-bar]')).map(
          (bar) => bar.getBoundingClientRect().bottom,
        ),
      ) - bounds.top;
    const localNotes = notes
      .filter((note) => note.lineFrom === line.from)
      .map((note) => ({
        ...note,
        bar: {
          left: note.bar.left - left,
          right: note.bar.right - left,
          top: note.bar.top - top,
          bottom: note.bar.bottom - top,
        },
      }));
    const positions = placePitchLabels(
      localNotes,
      roll.width,
      bottom - top,
      obstacles
        .filter((obstacle) => obstacle.top >= top && obstacle.bottom <= bottom)
        .map((obstacle) => ({
          left: obstacle.left - left,
          right: obstacle.right - left,
          top: obstacle.top - top,
          bottom: obstacle.bottom - top,
        })),
      true,
      searchBudget,
    );
    labels[line.from] = {};
    overflows[line.from] = Math.max(
      0,
      ...positions.map((label) => label.bottom + 2 - (bottom - top)),
    );
    for (const [index, label] of positions.entries()) {
      const { bar, index: noteIndex } = localNotes[index]!;
      const above = label.bottom <= bar.top;
      const connectorTop = above ? label.bottom : bar.bottom;
      const connectorBottom = above ? bar.top : label.top;
      labels[line.from]![noteIndex] = {
        label: { left: label.left - bar.left, top: label.top - bar.top },
        connector: {
          left: Math.max(bar.left, Math.min(bar.right, (label.left + label.right) / 2)) - bar.left,
          top: connectorTop - bar.top,
          height: Math.max(0, connectorBottom - connectorTop),
        },
      };
    }
  }
  return { labels, overflows };
}
