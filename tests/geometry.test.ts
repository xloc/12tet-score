import { expect, test } from 'vite-plus/test';
import { layoutPitchLabels, measureNotes, measureTimeLines } from '../src/geometry';
import { barPosition, scoreLines, timePlacement } from '../src/layout';
import { placePitchLabels } from '../src/labels';
import { boxHits, tickAtPoint, type Rect } from '../src/selection';
import type { Note } from '../src/music';

function fixture(obstacles: Rect[] = [], graceIndices: number[] = []) {
  const held: Note = { pitch: 60, at: 1440, len: 2880, groups: ['lh', '3'] };
  const notes: Note[] = [
    { pitch: 60, at: 2400, len: 960, groups: ['lh', '2'] },
    held,
    ...Array.from({ length: 16 }, (_, index) => ({
      pitch: index === 0 && graceIndices.includes(2) ? 78 : 76,
      at: index * 120,
      len: 120,
      groups: ['rh', '1'],
    })),
    { pitch: 72, at: 3840, len: 120, groups: ['rh', '1'] },
  ];
  for (const index of graceIndices) notes[index]!.grace = true;
  const lines = scoreLines(notes, 5760, {
    ppq: 480,
    meters: [{ at: 0, meter: '4/4' }],
    width: 512,
    rem: 16,
    foldThreshold: 0,
    variableBarWidth: true,
  });
  const widths = [[409.59375, 102.40625], [512]];
  const origin = { left: 40.25, top: 30 };
  let top = 16;
  const rowElements = lines.map((line, lineIndex) => {
    const lineTop = top;
    const height = line.rows.length * 8;
    top += height + 48;
    let left = origin.left;
    const fragments: HTMLElement[] = [];
    const bars = line.bars.map((bar, barIndex) => {
      const width = widths[lineIndex]![barIndex]!;
      const barLeft = left;
      left += width;
      for (const { note, index } of bar.notes) {
        const placement = timePlacement(note.at, note.at + note.len, bar);
        const noteLeft = barLeft + (parseFloat(placement.left) / 100) * width;
        const noteWidth = (parseFloat(placement.width) / 100) * width;
        const noteTop = origin.top + lineTop + line.rows.indexOf(note.pitch) * 8 + 2;
        fragments.push({
          dataset: { noteIndex: String(index) },
          getBoundingClientRect: () => ({
            left: noteLeft,
            right: noteLeft + noteWidth,
            top: noteTop,
            bottom: noteTop + 4,
          }),
          querySelector: () => (note.grace ? null : { offsetWidth: 32, offsetHeight: 16 }),
        } as unknown as HTMLElement);
      }
      return {
        getBoundingClientRect: () => ({
          left: barLeft,
          right: barLeft + width,
          width,
          top: origin.top + lineTop,
          bottom: origin.top + lineTop + height,
        }),
      } as unknown as HTMLElement;
    });
    return {
      getBoundingClientRect: () => ({
        left: origin.left,
        right: left,
        top: origin.top + lineTop,
        bottom: origin.top + lineTop + height,
      }),
      querySelector: () => ({
        getBoundingClientRect: () => ({
          left: origin.left,
          top: origin.top + lineTop,
          width: left - origin.left,
        }),
      }),
      querySelectorAll: (selector: string) => (selector === '[data-score-bar]' ? bars : fragments),
    } as unknown as HTMLElement;
  });
  const obstacleElements = obstacles.map(
    (rect) =>
      ({
        getBoundingClientRect: () => ({
          left: rect.left + origin.left,
          right: rect.right + origin.left,
          top: rect.top + origin.top,
          bottom: rect.bottom + origin.top,
        }),
      }) as unknown as HTMLElement,
  );
  const surface = {
    scrollWidth: 512,
    getBoundingClientRect: () => ({ ...origin, width: 512, height: top - 48 + 16 }),
    querySelectorAll: (selector: string) =>
      selector === '[data-score-line]' ? rowElements : obstacleElements,
  } as unknown as HTMLElement;
  return { held, notes, lines, surface };
}

test('unlabeled grace bars remain measurable and block nearby ordinary labels', () => {
  const { lines, surface } = fixture([], [2]);
  const measured = measureNotes(surface, lines);
  const layout = layoutPitchLabels(surface, lines);
  const grace = measured.find((note) => note.index === 2)!;
  expect(layout.labels[grace.lineFrom]![grace.index]).toBeUndefined();
  for (const note of measured) {
    const position = layout.labels[note.lineFrom]![note.index];
    if (!position) continue;
    const label = {
      left: note.bar.left + position.label.left,
      top: note.bar.top + position.label.top,
      right: note.bar.left + position.label.left + 32,
      bottom: note.bar.top + position.label.top + 16,
    };
    expect(boxHits({ ...label, mode: 'intersect' }, grace.bar)).toBe(false);
  }
  const next = measured.find((note) => note.index === 3)!;
  expect(next.bar.top + layout.labels[next.lineFrom]![3]!.label.top).toBeGreaterThanOrEqual(
    next.bar.bottom + 2,
  );
});

test('a roll containing only grace notes needs no label positions or overflow', () => {
  const { lines, surface } = fixture(
    [],
    Array.from({ length: 19 }, (_, index) => index),
  );
  const layout = layoutPitchLabels(surface, lines);
  expect(measureNotes(surface, lines)).toHaveLength(
    lines.reduce((count, line) => count + line.notes.length, 0),
  );
  expect(Object.values(layout.labels)).toEqual(lines.map(() => ({})));
  expect(Object.values(layout.overflows)).toEqual(lines.map(() => 0));
});

test('interaction reads final fractional bar bounds without feeding them back into rendering', () => {
  const { lines, surface } = fixture();
  expect(lines.map((line) => line.bars.length)).toEqual([2, 1]);
  const geometry = measureTimeLines(surface, lines);
  expect(geometry[0]!.bars).toEqual([
    { from: 0, to: 1920, left: 0, right: 409.59375 },
    { from: 1920, to: 3840, left: 409.59375, right: 512 },
  ]);
  for (const line of geometry) {
    for (const bar of line.bars) {
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const tick = bar.from + fraction * (bar.to - bar.from);
        const x = bar.left + barPosition(tick, bar) * (bar.right - bar.left);
        expect(tickAtPoint({ x, y: line.top + 2 }, geometry, 480)).toBe(tick);
      }
    }
  }
});

test('cross-bar fragments are measured as the same full note range in each line', () => {
  const { held, lines, surface } = fixture();
  const measured = measureNotes(surface, lines);
  const carried = measured.filter((note) => note.index === 1);
  expect(carried).toHaveLength(2);
  expect(carried[0]!.bar).toEqual({ left: 409.59375 * 0.75, right: 512, top: 146, bottom: 150 });
  expect(carried[1]!.bar).toEqual({ left: 0, right: 128, top: 298, bottom: 302 });
  expect(lines.every((line) => line.rows.includes(held.pitch))).toBe(true);
  expect(lines[0]!.bars[0]!.notes.find(({ note }) => note === held)!.note).toBe(held);
  expect(lines[1]!.bars[0]!.notes.find(({ note }) => note === held)!.note).toBe(held);
  expect(held.len).toBe(2880);
});

test('contain selection still requires the whole line-visible note, while touch can hit one fragment', () => {
  const { lines, surface } = fixture();
  const note = measureNotes(surface, lines).find((note) => note.index === 1)!.bar;
  const box = { left: 400, right: 512, top: note.top, bottom: note.bottom };
  expect(boxHits({ ...box, mode: 'contain' }, note)).toBe(false);
  expect(boxHits({ ...box, mode: 'intersect' }, note)).toBe(true);
  expect(boxHits({ ...note, mode: 'contain' }, note)).toBe(true);
});

test('label placement retains original note order and full spans after fragment grouping', () => {
  const { lines, surface } = fixture();
  const measured = measureNotes(surface, lines);
  expect(measured.slice(0, lines[0]!.notes.length).map((note) => note.index)).toEqual(
    lines[0]!.notes.map((note) => note.index),
  );
  const actual = layoutPitchLabels(surface, lines);
  const geometry = measureTimeLines(surface, lines);
  for (const [lineIndex, line] of geometry.entries()) {
    const notes = measured
      .filter((note) => note.lineFrom === line.from)
      .map((note) => ({
        ...note,
        width: 32,
        height: 16,
        bar: { ...note.bar, top: note.bar.top - line.top, bottom: note.bar.bottom - line.top },
      }));
    const minTop = (geometry[lineIndex - 1]?.bottom ?? 0) - line.top;
    const expected = placePitchLabels(notes, 512, line.bottom - line.top, [], minTop);
    for (const [index, note] of notes.entries()) {
      const position = actual.labels[note.lineFrom]![note.index]!;
      expect(position.label.left + note.bar.left).toBe(expected[index]!.left);
      expect(position.label.top + note.bar.top).toBe(expected[index]!.top);
      expect(expected[index]!.top).toBeGreaterThanOrEqual(minTop);
      expect(expected[index]!.bottom).toBeLessThanOrEqual(
        line.bottom - line.top + actual.overflows[line.from]!,
      );
    }
  }
});

test('labels use the existing space above a roll while avoiding actual bar numbers', () => {
  const { lines, surface } = fixture([{ left: 0, top: 0, right: 16, bottom: 16 }]);
  const measured = measureNotes(surface, lines);
  const layout = layoutPitchLabels(surface, lines);
  const rollTop = measureTimeLines(surface, lines)[0]!.top;
  const numberedNote = measured.find(
    (note) => note.lineFrom === lines[0]!.from && note.index === 2,
  )!;
  const clearNote = measured.find((note) => note.lineFrom === lines[0]!.from && note.index === 3)!;
  const numberedTop = numberedNote.bar.top + layout.labels[numberedNote.lineFrom]![2]!.label.top;
  const clearTop = clearNote.bar.top + layout.labels[clearNote.lineFrom]![3]!.label.top;
  expect(numberedTop).toBeGreaterThanOrEqual(rollTop);
  expect(clearTop).toBeGreaterThanOrEqual(0);
  expect(clearTop + 16).toBeLessThanOrEqual(rollTop);
});

test('a title above a roll remains an obstacle for its pitch labels', () => {
  const { lines, surface } = fixture([{ left: 0, top: 0, right: 512, bottom: 16 }]);
  const layout = layoutPitchLabels(surface, lines);
  for (const note of measureNotes(surface, lines).filter(
    (note) => note.lineFrom === lines[0]!.from,
  )) {
    const top = note.bar.top + layout.labels[note.lineFrom]![note.index]!.label.top;
    expect(top).toBeGreaterThanOrEqual(18);
  }
});
