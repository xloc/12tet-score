import assert from 'node:assert/strict';
import { test } from 'vite-plus/test';
import { chordNames } from './chords.ts';
import { score, ticksPerBar, type Note } from './music.ts';
import {
  boxHits,
  notesSelection,
  selectedIndices,
  selectionBox,
  selectionSpan,
  type MusicSelection,
} from './selection.ts';

const empty: MusicSelection = { kind: 'notes', indices: [] };
const notes: Note[] = [
  { pitch: 60, at: 0, len: 960, voice: 1 },
  { pitch: 64, at: 240, len: 120, voice: 2 },
  { pitch: 67, at: 360, len: 120, voice: 2 },
  { pitch: 72, at: 960, len: 480, voice: 1 },
];

test('left-to-right contains whole notes; right-to-left includes partial notes', () => {
  const start = { x: 20, y: 20 };
  const end = { x: 60, y: 60 };
  const inside = { left: 25, right: 55, top: 25, bottom: 55 };
  const crossing = { left: 10, right: 30, top: 25, bottom: 55 };
  const outside = { left: 65, right: 85, top: 25, bottom: 55 };
  const contain = selectionBox(start, end);
  const intersect = selectionBox(end, start);
  assert.equal(contain.mode, 'contain');
  assert.equal(intersect.mode, 'intersect');
  assert(boxHits(contain, inside));
  assert(!boxHits(contain, crossing));
  assert(boxHits(intersect, crossing));
  assert(!boxHits(intersect, outside));
});

test('vertical drag direction preserves the horizontal selection rule and edge contact', () => {
  const bounds = { left: 20, right: 60, top: 20, bottom: 60 };
  const up = selectionBox({ x: 20, y: 60 }, { x: 60, y: 20 });
  assert.equal(up.mode, 'contain');
  assert(boxHits(up, bounds));
  const edge = { left: 60, right: 80, top: 30, bottom: 50 };
  assert(!boxHits(up, edge));
  assert(boxHits(selectionBox({ x: 60, y: 20 }, { x: 20, y: 60 }), edge));
});

test('time ranges include sounding notes and exclude notes just outside either boundary', () => {
  const selection: MusicSelection = { kind: 'range', from: 240, to: 360 };
  assert.deepEqual(selectedIndices(notes, selection), [0, 1]);
  assert.deepEqual(selectionSpan(notes, selection), { from: 240, to: 360 });
  assert.deepEqual(selectedIndices(notes, { kind: 'range', from: 480, to: 960 }), [0]);
  assert.deepEqual(selectedIndices(notes, { kind: 'range', from: 960, to: 1440 }), [3]);
});

test('single, added, and toggled selections share one source of truth', () => {
  const single = notesSelection(notes, empty, [0]);
  assert.deepEqual(selectedIndices(notes, single), [0]);
  const multiple = notesSelection(notes, single, [0, 1, 2], 'add');
  assert.deepEqual(selectedIndices(notes, multiple), [0, 1, 2]);
  assert.deepEqual(selectedIndices(notes, notesSelection(notes, multiple, [1], 'toggle')), [0, 2]);
  assert.deepEqual(selectedIndices(notes, notesSelection(notes, single, [0], 'toggle')), []);
});

test('adding notes to a time range converts it to an explicit note selection', () => {
  const range: MusicSelection = { kind: 'range', from: 240, to: 360 };
  assert.deepEqual(notesSelection(notes, range, [3], 'add'), { kind: 'notes', indices: [0, 1, 3] });
  assert.deepEqual(notesSelection(notes, range, [0], 'toggle'), { kind: 'notes', indices: [1] });
});

test('note selections report elapsed span rather than the sum of overlapping durations', () => {
  assert.equal(selectionSpan(notes, empty), null);
  assert.deepEqual(selectionSpan(notes, { kind: 'notes', indices: [1] }), { from: 240, to: 360 });
  assert.deepEqual(selectionSpan(notes, { kind: 'notes', indices: [0, 1, 2] }), {
    from: 0,
    to: 960,
  });
});

test('the opening arpeggio suggests C major despite repeats, register, and order', () => {
  const opening = score.notes.filter((note) => note.at < ticksPerBar);
  assert.deepEqual(chordNames(opening), ['C']);
  assert.deepEqual(chordNames([...opening].reverse()), ['C']);
  assert.deepEqual(chordNames(opening.map((note) => ({ ...note, pitch: note.pitch + 2 }))), ['D']);
});

test('ambiguous chord sets keep their alternative names', () => {
  const pitches = [60, 64, 67, 69].map((pitch) => ({ pitch, at: 0, len: 480, voice: 1 }));
  assert.deepEqual(chordNames(pitches), ['C6', 'Am7']);
});

test('empty, incomplete, and mixed pitch sets do not receive a forced chord name', () => {
  assert.deepEqual(chordNames([]), []);
  assert.deepEqual(chordNames(notes.slice(0, 2)), []);
  assert.deepEqual(chordNames(score.notes), []);
});
