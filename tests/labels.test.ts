import assert from 'node:assert/strict';
import { test } from 'vite-plus/test';
import { placePitchLabels } from '../src/labels';
import { pitchLabel } from '../src/music';
import { scoreLines } from '../src/layout';
import { boxHits, type Rect } from '../src/selection';
import { fixedGeometry, positionAtTick } from './helpers/score';

function assertClear(
  notes: { bar: Rect; width: number; height: number }[],
  labels: Rect[],
  width: number,
  height: number,
  obstacles: Rect[] = [],
) {
  for (const [index, label] of labels.entries()) {
    assert(label.left >= 0 && label.right <= width);
    assert(label.top >= 0 && label.bottom <= height);
    assert(Math.abs(label.right - label.left - notes[index]!.width) < 1e-9);
    assert.equal(label.bottom - label.top, notes[index]!.height);
    const box = { ...label, mode: 'intersect' as const };
    assert(
      notes.every(({ bar }) => !boxHits(box, bar)),
      'a label overlaps a duration bar',
    );
    assert(
      labels.slice(0, index).every((other) => !boxHits(box, other)),
      'pitch labels overlap',
    );
    assert(
      obstacles.every((obstacle) => !boxHits(box, obstacle)),
      'a label overlaps a reserved region',
    );
  }
}

test('an isolated pitch label sits just above its duration bar without moving the bar', () => {
  const bar = { left: 20, top: 40, right: 160, bottom: 44 };
  const notes = [{ bar, width: 24, height: 16 }];
  const labels = placePitchLabels(notes, 200, 96);
  assert.equal(labels[0]!.left, bar.left);
  assert(labels[0]!.bottom < bar.top);
  assertClear(notes, labels, 200, 96);
  assert.deepEqual(bar, { left: 20, top: 40, right: 160, bottom: 44 });
});

test('simultaneous semitone neighbors relocate labels into clear space', () => {
  const notes = [18, 26, 34].map((top) => ({
    bar: { left: 20, top, right: 180, bottom: top + 4 },
    width: 24,
    height: 16,
  }));
  const labels = placePitchLabels(notes, 200, 56);
  assertClear(notes, labels, 200, 56);
  assert(labels.some((label) => label.left > 20));
  assert(labels.some((label, index) => label.top > notes[index]!.bar.bottom));
});

test('a short note at the line end retains its full pitch label within the line', () => {
  const notes = [{ bar: { left: 200, top: 40, right: 220, bottom: 44 }, width: 32, height: 16 }];
  const labels = placePitchLabels(notes, 220, 96);
  assertClear(notes, labels, 220, 96);
  assert.equal(labels[0]!.right, 220);
});

test('labels can sit outside a tightly cropped line without expanding its pitch range', () => {
  const line = { top: 16, bottom: 24 };
  const bar = { left: 20, top: 18, right: 180, bottom: 22 };
  const notes = [{ bar, width: 24, height: 16 }];
  const labels = placePitchLabels(notes, 200, 40);
  assert(labels[0]!.bottom <= line.top);
  assertClear(notes, labels, 200, 40);
  assert.deepEqual(line, { top: 16, bottom: 24 });
  assert.deepEqual(bar, { left: 20, top: 18, right: 180, bottom: 22 });
});

test('a cropped roll reserves label space below itself instead of searching above its title', () => {
  const notes = [{ bar: { left: 20, top: 2, right: 180, bottom: 6 }, width: 24, height: 16 }];
  const labels = placePitchLabels(notes, 200, 8, [], true);
  assert(labels[0]!.top >= 0);
  assert(labels[0]!.top > notes[0]!.bar.bottom);
  assertClear(notes, labels, 200, labels[0]!.bottom);
});

test('labels use clear space inside their own roll before extending it', () => {
  const notes = [
    { bar: { left: 20, top: 2, right: 80, bottom: 6 }, width: 32, height: 16 },
    { bar: { left: 100, top: 42, right: 160, bottom: 46 }, width: 32, height: 16 },
  ];
  const labels = placePitchLabels(notes, 200, 48, [], true);
  assertClear(notes, labels, 200, 48);
});

test('relocated labels leave folded pitch gaps clear', () => {
  const notes = [{ bar: { left: 20, top: 42, right: 180, bottom: 46 }, width: 24, height: 16 }];
  const folds = [{ left: 0, top: 24, right: 200, bottom: 40 }];
  const labels = placePitchLabels(notes, 200, 80, folds);
  assertClear(notes, labels, 200, 80, folds);
  assert(labels[0]!.top > notes[0]!.bar.bottom);
});

test('horizontal placement finds narrow clear gaps instead of skipping by a whole label width', () => {
  const notes = [{ bar: { left: 0, top: 40, right: 200, bottom: 44 }, width: 24, height: 16 }];
  const obstacles = [
    { left: 0, top: 20, right: 31, bottom: 40 },
    { left: 60, top: 20, right: 200, bottom: 40 },
  ];
  const labels = placePitchLabels(notes, 200, 96, obstacles);
  assert.deepEqual(labels, [{ left: 32, top: 22, right: 56, bottom: 38 }]);
  assertClear(notes, labels, 200, 96, obstacles);
});

test('nearby upper labels use local clear space without crossing a folded region', () => {
  const notes = [
    { bar: { left: 0, top: 90, right: 466, bottom: 94 }, width: 75, height: 16 },
    { bar: { left: 233, top: 42, right: 310, bottom: 46 }, width: 75, height: 16 },
    { bar: { left: 310, top: 26, right: 388, bottom: 30 }, width: 76, height: 16 },
  ];
  const folds = [{ left: 0, top: 64, right: 466, bottom: 72 }];
  const labels = placePitchLabels(notes, 466, 96, folds, true);
  assert.equal(labels[1]!.bottom, 40);
  assert.equal(labels[2]!.bottom, 24);
  assert(labels[0]!.left < 233, 'the bass label skips nearby clear space');
  assertClear(notes, labels, 466, 96, folds);
});

test('a blocked label stops searching and accepts overlap directly above its note', () => {
  let checks = 0;
  const obstacle = {
    left: 0,
    get right() {
      assert(++checks <= 16_384, 'a blocked label kept searching past its work limit');
      return 200;
    },
    top: 0,
    bottom: 1_000_000,
  };
  const notes = [{ bar: { left: 20, top: 40, right: 160, bottom: 44 }, width: 24, height: 16 }];
  const labels = placePitchLabels(notes, 200, 1_000_000, [obstacle], true);
  assert(checks > 0);
  assert.deepEqual(labels, [{ left: 20, top: 22, right: 44, bottom: 38 }]);
  assert(
    boxHits(
      { ...labels[0]!, mode: 'intersect' },
      { left: 0, top: 0, right: 200, bottom: 1_000_000 },
    ),
  );
});

test('a dense line shares a total search limit and keeps every fallback label at its note', () => {
  let checks = 0;
  const notes = Array.from({ length: 100 }, () => ({
    bar: {
      left: 20,
      top: 40,
      get right() {
        assert(++checks <= 100_100, 'a dense line kept searching past its shared work limit');
        return 160;
      },
      bottom: 44,
    },
    width: 24,
    height: 16,
  }));
  const labels = placePitchLabels(
    notes,
    200,
    1_000_000,
    [{ left: 0, top: 0, right: 200, bottom: 1_000_000 }],
    true,
  );
  assert.equal(labels.length, notes.length);
  assert(checks > 16_384);
  assert(labels.every((label) => label.left === 20 && label.top === 22));
});

test('multiple lines share a search budget and stop inspecting obstacles once it is spent', () => {
  const budget = { remaining: 100_000 };
  let checks = 0;
  const obstacle = {
    left: 0,
    get right() {
      checks++;
      return 200;
    },
    top: 0,
    bottom: 1_000_000,
  };
  const notes = [{ bar: { left: 20, top: 40, right: 160, bottom: 44 }, width: 24, height: 16 }];
  for (let line = 0; line < 8; line++) {
    assert.deepEqual(placePitchLabels(notes, 200, 1_000_000, [obstacle], true, budget), [
      { left: 20, top: 22, right: 44, bottom: 38 },
    ]);
  }
  assert.equal(budget.remaining, 0);
  const previousChecks = checks;
  placePitchLabels(notes, 200, 1_000_000, [obstacle], true, budget);
  assert.equal(checks, previousChecks);
});

test('searches with no valid candidates also stop within the work limit', () => {
  let scans = 0;
  const notes = [
    {
      bar: {
        left: 20,
        get top() {
          assert(++scans <= 16_386, 'invalid positions bypassed the search work limit');
          return 40;
        },
        right: 160,
        bottom: 44,
      },
      width: 24,
      height: 1_000_001,
    },
  ];
  assert.deepEqual(placePitchLabels(notes, 200, 1_000_000), [
    { left: 20, top: 0, right: 44, bottom: 1_000_001 },
  ]);
});

test('compact labels remain clear around held bass and dense attacks at phone and desktop widths', () => {
  const notes = [
    { pitch: 36, at: 0, len: 3840, groups: [] },
    ...Array.from({ length: 32 }, (_, index) => ({
      pitch: [60, 61, 67, 72][index % 4]!,
      at: index * 120,
      len: 120,
      groups: [],
    })),
  ];
  for (const width of [375, 1024, 1440]) {
    for (const variableBarWidth of [false, true]) {
      for (const foldThreshold of [0, 3, 6, 12, 24]) {
        const lines = scoreLines(notes, 3840, {
          ppq: 480,
          meters: [{ at: 0, meter: '4/4' }],
          width,
          rem: 16,
          foldThreshold,
          variableBarWidth,
        });
        for (const line of lines) {
          const geometry = fixedGeometry(
            line,
            line.bars.map((bar) => (variableBarWidth ? bar.minimum : bar.preferred)),
          );
          const height = line.rows.length * 8;
          const obstacles = line.rows.flatMap((row, index) =>
            typeof row === 'number'
              ? []
              : [{ left: 0, top: index * 8, right: geometry.width, bottom: (index + 1) * 8 }],
          );
          const notes = line.notes.map(({ note }) => {
            const top = line.rows.indexOf(note.pitch) * 8 + 2;
            return {
              bar: {
                left: positionAtTick(note.at, geometry.bars),
                right: positionAtTick(note.at + note.len, geometry.bars),
                top,
                bottom: top + 4,
              },
              width: pitchLabel(note.pitch).length * 7 + 4,
              height: 16,
            };
          });
          const labels = placePitchLabels(notes, geometry.width, height, obstacles, true);
          assertClear(
            notes,
            labels,
            geometry.width,
            Math.max(height, ...labels.map((label) => label.bottom)),
            obstacles,
          );
        }
      }
    }
  }
});
