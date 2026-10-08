import assert from 'node:assert/strict';
import { test } from 'vite-plus/test';
import { placePitchLabels } from './labels';
import { pitchLabel, score, scoreLines, ticksPerBar, totalTicks } from './music';
import { boxHits, type Rect } from './selection';

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
    assert.equal(label.right - label.left, notes[index]!.width);
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

test('relocated labels leave folded pitch gaps clear', () => {
  const notes = [{ bar: { left: 20, top: 42, right: 180, bottom: 46 }, width: 24, height: 16 }];
  const folds = [{ left: 0, top: 24, right: 200, bottom: 40 }];
  const labels = placePitchLabels(notes, 200, 80, folds);
  assertClear(notes, labels, 200, 80, folds);
  assert(labels[0]!.top > notes[0]!.bar.bottom);
});

test('compact labels remain clear across neighboring prelude lines at phone and desktop widths', () => {
  for (const [width, barsPerLine] of [
    [375, 1],
    [1024, 2],
    [1440, 2],
  ] as const) {
    for (const foldThreshold of [0, 3, 6, 12, 24]) {
      let height = 16;
      const obstacles: Rect[] = [];
      const lines = scoreLines(score.notes, totalTicks, ticksPerBar, barsPerLine, foldThreshold);
      const notes = lines.flatMap((line, index) => {
        const lineWidth = (width * (line.to - line.from)) / (barsPerLine * ticksPerBar);
        const lineTop = height;
        const beatsPerBar = ticksPerBar / score.ppq;
        for (let beat = 0; beat < (line.to - line.from) / score.ppq; beat++) {
          const number =
            beat % beatsPerBar === 0
              ? 1 + line.from / ticksPerBar + Math.floor(beat / beatsPerBar)
              : (beat % beatsPerBar) + 1;
          const left = ((beat * score.ppq) / (line.to - line.from)) * lineWidth;
          obstacles.push({
            left,
            right: left + String(number).length * 6 + 8,
            top: lineTop - 16,
            bottom: lineTop,
          });
        }
        const rowTops = line.rows.map((row) => {
          const top = height;
          height += 8;
          if (typeof row !== 'number') {
            obstacles.push({ left: 0, top, right: lineWidth, bottom: height });
          }
          return top;
        });
        height += index === lines.length - 1 ? 16 : 48;
        return line.notes.map(({ note }) => {
          const top = rowTops[line.rows.indexOf(note.pitch)]! + 2;
          return {
            bar: {
              left:
                ((Math.max(note.at, line.from) - line.from) / (line.to - line.from)) * lineWidth,
              right:
                ((Math.min(note.at + note.len, line.to) - line.from) / (line.to - line.from)) *
                lineWidth,
              top,
              bottom: top + 4,
            },
            width: pitchLabel(note.pitch).length * 7 + 4,
            height: 16,
          };
        });
      });
      assertClear(
        notes,
        placePitchLabels(notes, width, height, obstacles),
        width,
        height,
        obstacles,
      );
    }
  }
});
