import { expect, test } from 'vite-plus/test';
import { layoutPitchLabels, measureNotes, measureTimeLines } from './geometry';
import { barPosition, scoreLines, timePlacement } from './layout';
import { placePitchLabels } from './labels';
import { boxHits, tickAtPoint } from './selection';
import type { Note } from './music';

function fixture() {
  const held: Note = { pitch: 60, at: 1440, len: 2880, voice: 3 };
  const notes = [
    { pitch: 60, at: 2400, len: 960, voice: 2 },
    held,
    ...Array.from({ length: 16 }, (_, index) => ({
      pitch: 76,
      at: index * 120,
      len: 120,
      voice: 1,
    })),
    { pitch: 72, at: 3840, len: 120, voice: 1 },
  ];
  const lines = scoreLines(notes, 5760, {
    ppq: 480,
    ticksPerBar: 1920,
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
          querySelector: () => ({ offsetWidth: 32, offsetHeight: 16 }),
        } as unknown as HTMLElement);
      }
      return {
        getBoundingClientRect: () => ({ left: barLeft, right: barLeft + width, width }),
      } as unknown as HTMLElement;
    });
    return {
      getBoundingClientRect: () => ({
        left: origin.left,
        right: left,
        top: origin.top + lineTop,
        bottom: origin.top + lineTop + height,
      }),
      querySelectorAll: (selector: string) => (selector === '[data-score-bar]' ? bars : fragments),
    } as unknown as HTMLElement;
  });
  const surface = {
    scrollWidth: 512,
    getBoundingClientRect: () => ({ ...origin, width: 512, height: top - 48 + 16 }),
    querySelectorAll: (selector: string) => (selector === '[data-score-line]' ? rowElements : []),
  } as unknown as HTMLElement;
  return { held, notes, lines, surface };
}

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
  const expected = placePitchLabels(
    measured.map((note) => ({ ...note, width: 32, height: 16 })),
    512,
    surface.getBoundingClientRect().height,
  );
  const actual = layoutPitchLabels(surface, lines);
  for (const [index, note] of measured.entries()) {
    const position = actual[note.lineFrom]![note.index]!;
    expect(position.label.left + note.bar.left).toBe(expected[index]!.left);
    expect(position.label.top + note.bar.top).toBe(expected[index]!.top);
  }
});
