import assert from 'node:assert/strict';
import { test } from 'vite-plus/test';
import { placePitchLabels } from '../src/labels';
import { pitchLabel, scoreDuration } from '../src/music';
import { scoreLines } from '../src/layout';
import { boxHits, type Rect } from '../src/selection';
import { createScore, fixedGeometry, positionAtTick } from './helpers/score';

function assertClear(
  notes: { bar: Rect; width: number; height: number }[],
  labels: Rect[],
  width: number,
  height: number,
  obstacles: Rect[] = [],
  minTop = 0,
) {
  for (const [index, label] of labels.entries()) {
    assert(label.left >= 0 && label.right <= width);
    assert(label.top >= minTop && label.bottom <= height);
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

test('a multiline upper label reserves nearby space before lower labels while retaining input order', () => {
  const notes = [
    { bar: { left: 20, top: 58, right: 84, bottom: 62 }, width: 18, height: 16 },
    { bar: { left: 20, top: 18, right: 84, bottom: 22 }, width: 18, height: 32 },
  ];
  const labels = placePitchLabels(notes, 200, 312);
  assert.deepEqual(labels, [
    { left: 20, top: 64, right: 38, bottom: 80 },
    { left: 20, top: 24, right: 38, bottom: 56 },
  ]);
  assertClear(notes, labels, 200, 312);
});

test('a small horizontal move preserves the pitch height before using a farther vertical gap', () => {
  const notes = [{ bar: { left: 20, top: 98, right: 84, bottom: 102 }, width: 24, height: 16 }];
  const obstacles = [
    { left: 20, top: 64, right: 38, bottom: 80 },
    { left: 20, top: 114, right: 84, bottom: 118 },
  ];
  const labels = placePitchLabels(notes, 200, 312, obstacles);
  assert.deepEqual(labels, [{ left: 39, top: 80, right: 63, bottom: 96 }]);
  assertClear(notes, labels, 200, 312, obstacles);
});

test('simultaneous semitone neighbors relocate labels into nearby clear space', () => {
  const notes = [18, 26, 34].map((top) => ({
    bar: { left: 20, top, right: 180, bottom: top + 4 },
    width: 24,
    height: 16,
  }));
  const labels = placePitchLabels(notes, 200, 56);
  assertClear(notes, labels, 200, Math.max(56, ...labels.map((label) => label.bottom)));
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
  const labels = placePitchLabels(notes, 200, 8);
  assert(labels[0]!.top >= 0);
  assert(labels[0]!.top > notes[0]!.bar.bottom);
  assertClear(notes, labels, 200, labels[0]!.bottom);
});

test('an upper label uses existing space above the roll', () => {
  const notes = [{ bar: { left: 20, top: 2, right: 100, bottom: 6 }, width: 24, height: 16 }];
  const labels = placePitchLabels(notes, 200, 64, [], -24);
  assert.deepEqual(labels, [{ left: 20, top: -16, right: 44, bottom: 0 }]);
  assertClear(notes, labels, 200, 64, [], -24);
});

test('an upper label stays below a title occupying the existing space', () => {
  const notes = [{ bar: { left: 20, top: 2, right: 100, bottom: 6 }, width: 24, height: 16 }];
  const obstacles = [{ left: 0, top: -32, right: 200, bottom: 0 }];
  const labels = placePitchLabels(notes, 200, 64, obstacles, -32);
  assert.deepEqual(labels, [{ left: 20, top: 8, right: 44, bottom: 24 }]);
  assertClear(notes, labels, 200, 64, obstacles, -32);
});

test('a label does not overflow past the available space above the roll', () => {
  const notes = [{ bar: { left: 20, top: 2, right: 100, bottom: 6 }, width: 24, height: 16 }];
  const labels = placePitchLabels(notes, 200, 64, [], -10);
  assert.deepEqual(labels, [{ left: 20, top: 8, right: 44, bottom: 24 }]);
  assertClear(notes, labels, 200, 64, [], -10);
});

test('a label above the roll can shift horizontally around a bar number', () => {
  const notes = [{ bar: { left: 20, top: 2, right: 100, bottom: 6 }, width: 24, height: 16 }];
  const obstacles = [
    { left: 20, top: -16, right: 35, bottom: 0 },
    { left: 0, top: 6, right: 200, bottom: 64 },
  ];
  const labels = placePitchLabels(notes, 200, 64, obstacles, -24);
  assert.deepEqual(labels, [{ left: 36, top: -16, right: 60, bottom: 0 }]);
  assertClear(notes, labels, 200, 64, obstacles, -24);
});

test('labels use clear space inside their own roll before extending it', () => {
  const notes = [
    { bar: { left: 20, top: 2, right: 80, bottom: 6 }, width: 32, height: 16 },
    { bar: { left: 100, top: 42, right: 160, bottom: 46 }, width: 32, height: 16 },
  ];
  const labels = placePitchLabels(notes, 200, 48);
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
    { left: 0, top: 0, right: 17, bottom: 40 },
    { left: 44, top: 20, right: 200, bottom: 40 },
    { left: 0, top: 44, right: 200, bottom: 96 },
  ];
  const labels = placePitchLabels(notes, 200, 96, obstacles);
  assert.deepEqual(labels, [{ left: 18, top: 22, right: 42, bottom: 38 }]);
  assertClear(notes, labels, 200, 96, obstacles);
});

test('the search expands its range when nearer grid positions are blocked', () => {
  const notes = [{ bar: { left: 20, top: 40, right: 160, bottom: 44 }, width: 24, height: 16 }];
  const obstacles = [
    { left: 0, top: 20, right: 200, bottom: 40 },
    { left: 20, top: 0, right: 50, bottom: 20 },
    { left: 20, top: 46, right: 50, bottom: 64 },
  ];
  const labels = placePitchLabels(notes, 200, 96, obstacles);
  assert.deepEqual(labels, [{ left: 20, top: 66, right: 44, bottom: 82 }]);
  assertClear(notes, labels, 200, 96, obstacles);
});

test('a nearby diagonal gap is preferred over a farther position at the default height', () => {
  const notes = [{ bar: { left: 20, top: 40, right: 100, bottom: 44 }, width: 24, height: 16 }];
  const obstacles = [
    { left: 20, top: 0, right: 30, bottom: 96 },
    { left: 0, top: 20, right: 31, bottom: 40 },
    { left: 0, top: 44, right: 43, bottom: 46 },
  ];
  const labels = placePitchLabels(notes, 200, 96, obstacles);
  assert.deepEqual(labels, [{ left: 31, top: 48, right: 55, bottom: 64 }]);
  assertClear(notes, labels, 200, 96, obstacles);
});

test.each([-40, -24])(
  'diagonal search respects the available space above the roll at %i px',
  (minTop) => {
    const notes = [{ bar: { left: 20, top: 2, right: 100, bottom: 6 }, width: 24, height: 16 }];
    const obstacles = [
      { left: 20, top: -40, right: 30, bottom: 64 },
      { left: 0, top: -16, right: 200, bottom: 0 },
      { left: 0, top: 6, right: 200, bottom: 64 },
    ];
    const labels = placePitchLabels(notes, 200, 64, obstacles, minTop);
    assert.deepEqual(
      labels,
      minTop === -40
        ? [{ left: 31, top: -34, right: 55, bottom: -18 }]
        : [{ left: 20, top: 66, right: 44, bottom: 82 }],
    );
    assertClear(notes, labels, 200, Math.max(64, labels[0]!.bottom), obstacles, minTop);
  },
);

test('nearby upper labels use local clear space without crossing a folded region', () => {
  const notes = [
    { bar: { left: 0, top: 90, right: 466, bottom: 94 }, width: 75, height: 16 },
    { bar: { left: 233, top: 42, right: 310, bottom: 46 }, width: 75, height: 16 },
    { bar: { left: 310, top: 26, right: 388, bottom: 30 }, width: 76, height: 16 },
  ];
  const folds = [{ left: 0, top: 64, right: 466, bottom: 72 }];
  const labels = placePitchLabels(notes, 466, 96, folds);
  assert.equal(labels[1]!.bottom, 40);
  assert.equal(labels[2]!.bottom, 24);
  assert(labels[0]!.left < 233, 'the bass label skips nearby clear space');
  assertClear(notes, labels, 466, 96, folds);
});

test('a blocked label jumps below a tall obstacle without scanning its pixels', () => {
  const run = (height: number) => {
    let checks = 0;
    const obstacle = {
      left: 0,
      get right() {
        checks++;
        return 200;
      },
      top: 0,
      bottom: height,
    };
    const notes = [{ bar: { left: 20, top: 40, right: 160, bottom: 44 }, width: 24, height: 16 }];
    const labels = placePitchLabels(notes, 200, height, [obstacle]);
    return { checks, labels, notes, obstacle };
  };
  const small = run(96);
  const large = run(1_000_000);
  assert(large.checks > 0);
  assert.equal(large.checks, small.checks, 'collision checks scale with the obstacle height');
  assert.deepEqual(large.labels, [{ left: 20, top: 1_000_002, right: 44, bottom: 1_000_018 }]);
  assertClear(large.notes, large.labels, 200, large.labels[0]!.bottom, [large.obstacle]);
});

test('a dense line keeps every overflow label clear of notes, obstacles, and earlier labels', () => {
  const notes = Array.from({ length: 100 }, () => ({
    bar: {
      left: 20,
      top: 40,
      right: 160,
      bottom: 44,
    },
    width: 24,
    height: 16,
  }));
  const obstacles = [{ left: 0, top: 0, right: 200, bottom: 1_000_000 }];
  const labels = placePitchLabels(notes, 200, 1_000_000, obstacles);
  assert.equal(labels.length, notes.length);
  assert(labels.every((label) => label.left === 20 && label.top >= 1_000_002));
  assertClear(notes, labels, 200, labels.at(-1)!.bottom, obstacles);
});

test('an exact-height gap retains the required spacing on both sides', () => {
  const notes = [{ bar: { left: 20, top: 40, right: 160, bottom: 44 }, width: 24, height: 16 }];
  const obstacles = [{ left: 0, top: 0, right: 200, bottom: 20 }];
  const labels = placePitchLabels(notes, 200, 96, obstacles);
  assert.deepEqual(labels, [{ left: 20, top: 22, right: 44, bottom: 38 }]);
  assertClear(notes, labels, 200, 96, obstacles);
});

test('a long note does not send its label to a distant horizontal gap', () => {
  const notes = [{ bar: { left: 20, top: 40, right: 980, bottom: 44 }, width: 24, height: 16 }];
  const obstacles = [
    { left: 0, top: 0, right: 160, bottom: 40 },
    { left: 0, top: 44, right: 1000, bottom: 96 },
  ];
  const labels = placePitchLabels(notes, 1000, 96, obstacles);
  assert.deepEqual(labels, [{ left: 20, top: 98, right: 44, bottom: 114 }]);
  assertClear(notes, labels, 1000, labels[0]!.bottom, obstacles);
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
          const labels = placePitchLabels(notes, geometry.width, height, obstacles);
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

test.each([512, 1024, 1440, 1574])(
  'upper labels and closing chords stay near their notes at %i px',
  (width) => {
    const score = createScore({
      duration: 7680,
      meters: [{ at: 0, meter: '2/2' }],
      notes: [
        ...Array.from({ length: 8 }, (_, index) =>
          [47, 52, index < 4 ? 57 : 55].map((pitch) => ({
            pitch,
            at: index * 240,
            len: 240,
            groups: ['lh'],
          })),
        ).flat(),
        { pitch: 64, at: 0, len: 1440, groups: ['rh'] },
        { pitch: 66, at: 1440, len: 480, groups: ['rh'] },
        { pitch: 66, at: 1920, len: 480, groups: ['rh'] },
        { pitch: 64, at: 3840, len: 480, groups: ['rh'], text: 'pp' },
        { pitch: 63, at: 4320, len: 480, groups: ['rh'] },
        { pitch: 54, at: 4320, len: 480, groups: ['rh'] },
        ...[35, 47, 52, 59].map((pitch) => ({ pitch, at: 3840, len: 480, groups: ['lh'] })),
        ...[35, 47, 51, 59].map((pitch) => ({ pitch, at: 4320, len: 480, groups: ['lh'] })),
        ...[28, 40, 52, 55, 59, 64].map((pitch) => ({
          pitch,
          at: 5760,
          len: 1920,
          groups: ['lh'],
          text: [28, 64].includes(pitch) ? 'Fermata' : undefined,
        })),
      ],
    });
    const lines = scoreLines(score.notes, scoreDuration(score), {
      ppq: score.ppq,
      meters: score.meters,
      pickup: score.pickup,
      width,
      rem: 16,
      foldThreshold: 12,
      variableBarWidth: true,
    });
    const checked: number[] = [];
    for (const line of lines) {
      const geometry = fixedGeometry(line);
      const height = line.rows.length * 8;
      const folds = line.rows.flatMap((row, index) =>
        typeof row === 'number'
          ? []
          : [{ left: 0, top: index * 8, right: geometry.width, bottom: (index + 1) * 8 }],
      );
      const visibleNotes = line.notes.filter(({ note }) => !note.grace);
      const notes = visibleNotes.map(({ note }) => {
        const top = line.rows.indexOf(note.pitch) * 8 + 2;
        return {
          bar: {
            left: positionAtTick(note.at, geometry.bars),
            right: positionAtTick(note.at + note.len, geometry.bars),
            top,
            bottom: top + 4,
          },
          width: Math.ceil(
            Math.max(pitchLabel(note.pitch).length, note.text?.length ?? 0) * 6.6 + 4,
          ),
          height: note.text ? 32 : 16,
        };
      });
      const obstacles = [
        ...folds,
        ...line.notes
          .filter(({ note }) => note.grace)
          .map(({ note }) => {
            const top = line.rows.indexOf(note.pitch) * 8 + 2;
            return {
              left: positionAtTick(note.at, geometry.bars),
              right: positionAtTick(note.at + note.len, geometry.bars),
              top,
              bottom: top + 4,
            };
          }),
      ];
      const labels = placePitchLabels(notes, geometry.width, height, obstacles);
      for (const [index, label] of labels.entries()) {
        const note = notes[index]!;
        const anchorLeft = Math.max(0, Math.min(note.bar.left, geometry.width - note.width));
        assert(label.left >= anchorLeft && label.left <= anchorLeft + note.width);
      }
      assertClear(
        notes,
        labels,
        geometry.width,
        Math.max(height, ...labels.map((label) => label.bottom)),
        obstacles,
      );
      for (const bar of line.bars.filter((bar) => [1, 2, 3].includes(bar.number))) {
        if (bar.number === 3) {
          for (const [index, { note }] of visibleNotes.entries()) {
            if (note.at < bar.from || note.at >= bar.to) continue;
            const label = labels[index]!;
            const geometry = notes[index]!;
            const gap =
              label.bottom <= geometry.bar.top
                ? geometry.bar.top - label.bottom
                : label.top - geometry.bar.bottom;
            assert(label.bottom <= height, `${pitchLabel(note.pitch)} was pushed below the roll`);
            assert(
              gap >= 2 && gap <= geometry.height * 2 + 2,
              'the connector is unnecessarily long',
            );
          }
        } else {
          const highest = Math.max(...bar.notes.map(({ note }) => note.pitch));
          const index = visibleNotes.findIndex(
            ({ note }) => note.at >= bar.from && note.at < bar.to && note.pitch === highest,
          );
          assert(labels[index]!.top >= notes[index]!.bar.bottom + 2);
        }
        checked.push(bar.number);
      }
    }
    assert.deepEqual(checked, [1, 2, 3]);
  },
);
