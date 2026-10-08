import { tickAtPosition, type Note, type ScoreGeometry } from './music.ts';

export type MusicSelection =
  | { kind: 'notes'; indices: number[] }
  | { kind: 'range'; from: number; to: number };

export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; right: number; bottom: number };
export type SelectionBox = Rect & { mode: 'contain' | 'intersect' };

export function tickAtPoint(
  point: Point,
  lines: (Rect & ScoreGeometry & { from: number; to: number })[],
  ppq: number,
) {
  const line = lines.find((line) => point.y < line.bottom) ?? lines.at(-1)!;
  if (point.y < line.top) return line.from;
  const tick = tickAtPosition(point.x - line.left, line.bars);
  const cell = ppq / 4;
  return Math.max(
    line.from,
    Math.min(line.to, line.from + Math.round((tick - line.from) / cell) * cell),
  );
}

export function selectionBox(start: Point, end: Point): SelectionBox {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
    mode: end.x >= start.x ? 'contain' : 'intersect',
  };
}

export function boxHits(box: SelectionBox, rect: Rect) {
  if (box.mode === 'contain') {
    return (
      rect.left >= box.left &&
      rect.right <= box.right &&
      rect.top >= box.top &&
      rect.bottom <= box.bottom
    );
  }
  return (
    rect.right >= box.left &&
    rect.left <= box.right &&
    rect.bottom >= box.top &&
    rect.top <= box.bottom
  );
}

export function selectedIndices(notes: Note[], selection: MusicSelection) {
  if (selection.kind === 'notes') return selection.indices;
  return notes.flatMap((note, index) =>
    note.at < selection.to && note.at + note.len > selection.from ? [index] : [],
  );
}

export function notesSelection(
  notes: Note[],
  selection: MusicSelection,
  indices: number[],
  mode: 'replace' | 'add' | 'toggle' = 'replace',
): MusicSelection {
  if (mode === 'replace') return { kind: 'notes', indices };
  const selected = new Set(selectedIndices(notes, selection));
  for (const index of indices) {
    if (mode === 'toggle' && selected.has(index)) selected.delete(index);
    else selected.add(index);
  }
  return { kind: 'notes', indices: [...selected] };
}

export function selectionSpan(notes: Note[], selection: MusicSelection) {
  if (selection.kind === 'range') return { from: selection.from, to: selection.to };
  if (!selection.indices.length) return null;
  const selected = selection.indices.map((index) => notes[index]!);
  return {
    from: Math.min(...selected.map((note) => note.at)),
    to: Math.max(...selected.map((note) => note.at + note.len)),
  };
}
