import assert from 'node:assert/strict';
import { test } from 'vite-plus/test';
import { chordNames } from '../src/chords.ts';
import type { Note } from '../src/music.ts';
import {
  boxHits,
  notesSelection,
  selectedIndices,
  selectionBox,
  selectionSpan,
  tickAtPoint,
  type MusicSelection,
} from '../src/selection.ts';

const empty: MusicSelection = { kind: 'notes', indices: [] };
const notes: Note[] = [
  { pitch: 60, at: 0, len: 960, groups: ['rh', '1'] },
  { pitch: 64, at: 240, len: 120, groups: ['lh', '2'] },
  { pitch: 67, at: 360, len: 120, groups: ['lh', '2'] },
  { pitch: 72, at: 960, len: 480, groups: ['rh', '1'] },
];

test('opening lead-ins do not offset the beat-selection grid', () => {
  const line = {
    left: 0,
    top: 0,
    right: 510,
    bottom: 100,
    from: -30,
    to: 480,
    bars: [{ left: 0, right: 510, from: -30, to: 480 }],
  };
  assert.equal(tickAtPoint({ x: 30, y: 50 }, [line], 480), 0);
  assert.equal(tickAtPoint({ x: 150, y: 50 }, [line], 480), 120);
});

test('time selection follows wrapped lines, including a shorter final line', () => {
  const lines = [
    { left: 0, top: 0, right: 800, bottom: 200, from: 0, to: 3840 },
    { left: 0, top: 200, right: 800, bottom: 600, from: 3840, to: 7680 },
    { left: 0, top: 600, right: 400, bottom: 900, from: 7680, to: 9600 },
  ].map((line) => ({
    ...line,
    bars: [{ from: line.from, to: line.to, left: line.left, right: line.right }],
  }));
  assert.equal(tickAtPoint({ x: 600, y: 20 }, lines, 480), 2880);
  assert.equal(tickAtPoint({ x: 200, y: 220 }, lines, 480), 4800);
  assert.equal(tickAtPoint({ x: 200, y: 620 }, lines, 480), 8640);
  assert.equal(tickAtPoint({ x: 900, y: 620 }, lines, 480), 9600);
  assert.equal(tickAtPoint({ x: -20, y: 220 }, lines, 480), 3840);
  assert.equal(tickAtPoint({ x: 0, y: -20 }, lines, 480), 0);
  assert.equal(tickAtPoint({ x: 400, y: 1000 }, lines, 480), 9600);
  assert.equal(tickAtPoint({ x: 28, y: 220 }, lines, 480), 3960);
});

test('time selection in the gap between lines maps to their shared measure boundary', () => {
  const lines = [
    { left: 0, top: 0, right: 800, bottom: 200, from: 0, to: 3840 },
    { left: 0, top: 216, right: 800, bottom: 600, from: 3840, to: 7680 },
  ].map((line) => ({
    ...line,
    bars: [{ from: line.from, to: line.to, left: line.left, right: line.right }],
  }));
  for (const x of [0, 400, 800]) {
    assert.equal(tickAtPoint({ x, y: 208 }, lines, 480), 3840);
  }
  assert.equal(tickAtPoint({ x: 400, y: 220 }, lines, 480), 5760);
});

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

test('a C major arpeggio retains its chord despite repeats, register, and order', () => {
  const opening = [60, 64, 67, 72, 60].map((pitch, at) => ({ pitch, at, len: 1, groups: [] }));
  assert.deepEqual(chordNames(opening), ['CM', 'Em#5/C']);
  assert.deepEqual(chordNames([...opening].reverse()), ['CM', 'Em#5/C']);
  assert.deepEqual(chordNames(opening.map((note) => ({ ...note, pitch: note.pitch + 2 }))), [
    'DM',
    'F#m#5/D',
  ]);
});

test('ambiguous chord sets keep their alternative names', () => {
  const pitches = [60, 64, 67, 69].map((pitch) => ({
    pitch,
    at: 0,
    len: 480,
    groups: ['rh', '1'],
  }));
  assert.deepEqual(chordNames(pitches), ['C6', 'Am7/C']);
});

test('chord inversions use the lowest MIDI pitch without changing the source note order', () => {
  const pitches = [62, 57, 60, 54];
  const notes = pitches.map((pitch) => ({ pitch, at: 0, len: 480, groups: ['rh', '1'] }));
  assert.deepEqual(chordNames(notes), ['D7/F#']);
  assert.deepEqual(chordNames([...notes].reverse()), ['D7/F#']);
  assert.deepEqual(
    notes.map((note) => note.pitch),
    pitches,
  );
});

test('chord detection supports extensions and converts sharp MIDI pitches', () => {
  const notes = [48, 52, 55, 58, 62].map((pitch) => ({
    pitch,
    at: 0,
    len: 480,
    groups: ['rh', '1'],
  }));
  assert.deepEqual(chordNames(notes), ['C9']);
  assert.deepEqual(chordNames(notes.map((note) => ({ ...note, pitch: note.pitch + 1 }))), ['C#9']);
});

test('empty, incomplete, and mixed pitch sets do not receive a forced chord name', () => {
  assert.deepEqual(chordNames([]), []);
  assert.deepEqual(chordNames(notes.slice(0, 2)), []);
  assert.deepEqual(chordNames([60, 67, 69].map((pitch) => ({ pitch }))), []);
  assert.deepEqual(chordNames([60, 61, 62, 63].map((pitch) => ({ pitch }))), []);
});
