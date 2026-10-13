import { expect, test } from 'vite-plus/test';
import { annotationPlacements, scoreAnnotations } from '../src/annotations';
import { createScore } from './helpers/score';

const bars = [
  { from: 0, to: 1920, left: 40, right: 449.6 },
  { from: 1920, to: 3840, left: 449.6, right: 552 },
];

test('annotation spans follow measured nonuniform bar widths', () => {
  const [placement] = annotationPlacements(
    [{ at: 1440, len: 1440, text: 'Phrase', kind: 'text' }],
    0,
    3840,
    bars,
    () => 300,
  );
  expect(placement!.left).toBeCloseTo(307.2);
  expect(placement!.spanWidth).toBeCloseTo(153.6);
  expect(placement!.width).toBeCloseTo(153.6);
  expect(placement!.continuesBefore).toBe(false);
  expect(placement!.continuesAfter).toBe(false);
});

test('overlapping labels stack while adjacent intervals share a row without expanding for text', () => {
  const placed = annotationPlacements(
    [
      { at: 0, len: 120, text: 'Very short phrase with a longer explanation', kind: 'text' },
      { at: 120, len: 120, text: 'Adjacent interval', kind: 'text' },
      { at: 60, text: 'Overlapping explanation', kind: 'text' },
      { at: 1920, text: 'Separate explanation', kind: 'text' },
    ],
    0,
    3840,
    bars,
    () => 192,
  );
  expect(placed.map((placement) => placement.row)).toEqual([1, 1, 2, 1]);
  expect(placed[0]!.width).toBeCloseTo(25.6);
  expect(placed[0]!.spanWidth).toBeCloseTo(25.6);
});

test('continued intervals clip at line boundaries and point annotations appear only once', () => {
  const placed = annotationPlacements(
    [
      { at: 1440, len: 3360, text: 'Long instruction', kind: 'text' },
      { at: 1920, text: 'Point', kind: 'text' },
      { at: 3840, text: 'Next line', kind: 'text' },
    ],
    1920,
    3840,
    [bars[1]!],
    () => 192,
  );
  expect(placed).toHaveLength(2);
  expect(placed[0]!.continuesBefore).toBe(true);
  expect(placed[0]!.continuesAfter).toBe(true);
  expect(placed[0]!.spanWidth).toBeCloseTo(102.4);
  for (const placement of placed) {
    expect(placement.left).toBeGreaterThanOrEqual(0);
    expect(placement.left + placement.width).toBeLessThanOrEqual(102.40001);
  }
});

test('point captions use their text width instead of a fixed narrow column', () => {
  const [placement] = annotationPlacements(
    [{ at: 0, text: 'Count three quarter-note beats per bar.', kind: 'text' }],
    0,
    3840,
    bars,
    () => 300,
  );
  expect(placement!.width).toBe(300);
  expect(placement!.left).toBe(0);
});

test('captions near the line end wrap without moving their time anchor', () => {
  const [placement] = annotationPlacements(
    [{ at: 2880, len: 960, text: 'A long caption', kind: 'text' }],
    0,
    3840,
    bars,
    () => 300,
  );
  expect(placement!.left).toBeCloseTo(460.8);
  expect(placement!.width).toBeCloseTo(51.2);
  expect(placement!.spanWidth).toBeCloseTo(51.2);
});

test('tempo labels share a chord row only when they fit between its caption and interval end', () => {
  const placed = annotationPlacements(
    [
      { at: 0, len: 3840, text: 'Cmaj7', kind: 'chord' },
      { at: 480, text: '100 BPM', kind: 'timing' },
      { at: 240, text: '120 BPM', kind: 'timing' },
      { at: 3600, text: '80 BPM', kind: 'timing' },
      { at: 1440, text: 'A performance instruction', kind: 'text' },
    ],
    0,
    3840,
    bars,
    () => 64,
  );
  expect(placed.map((placement) => placement.row)).toEqual([1, 1, 2, 2, 2]);
});

test('a BPM caption at the line end keeps enough width to remain on one line', () => {
  const [placement] = annotationPlacements(
    [{ at: 3600, text: '100 BPM', kind: 'timing' }],
    0,
    3840,
    bars,
    () => 64,
  );
  expect(placement!.width).toBe(64);
  expect(placement!.left + placement!.width).toBe(512);
});

test('timing combines with chords while explanations and score fields remain separate', () => {
  const input = createScore({
    meters: [
      { at: 0, meter: '4/4' },
      { at: 3840, meter: '3/4' },
    ],
    tempos: [
      { at: 0, bpm: 80 },
      { at: 3840, bpm: 100 },
      { at: 5280, bpm: 72 },
    ],
    annotations: [{ at: 3840, text: 'Count three quarter-note beats per bar.' }],
    chords: [{ at: 5280, len: 1440, root: 'C', type: 'maj7' }],
  });
  const before = JSON.stringify(input);
  const items = scoreAnnotations(input);
  expect(items).toHaveLength(3);
  expect(items.find((item) => item.kind === 'text')!.timing).toBeUndefined();
  expect(items.find((item) => item.kind === 'timing')!.text).toBe('3/4 · 100 BPM');
  expect(items.find((item) => item.kind === 'chord')!.timing).toBe('72 BPM');
  expect(JSON.stringify(input)).toBe(before);
});

test('a chord takes timing changes at its start even when an explanation starts there too', () => {
  const items = scoreAnnotations(
    createScore({
      meters: [
        { at: 0, meter: '4/4' },
        { at: 1920, meter: '3/4' },
      ],
      tempos: [
        { at: 0, bpm: 80 },
        { at: 1920, bpm: 100 },
      ],
      annotations: [{ at: 1920, text: 'Count three beats.' }],
      chords: [{ at: 1920, len: 1440, root: 'F', type: 'maj7' }],
    }),
  );
  expect(items.filter((item) => item.kind === 'timing')).toHaveLength(0);
  expect(items.find((item) => item.kind === 'chord')!.timing).toBe('3/4 · 100 BPM');
  expect(items.find((item) => item.kind === 'text')!.text).toBe('Count three beats.');
});

test('sustain uses its custom comment while other pedal types keep their labels', () => {
  const items = scoreAnnotations(
    createScore({
      pedals: [
        { at: 0, len: 120, type: 'sustain' },
        { at: 240, len: 120, type: 'sustain', text: 'Change gently' },
        { at: 480, len: 120, type: 'sostenuto', text: 'Hold the bass' },
        { at: 720, len: 120, type: 'soft' },
      ],
    }),
  ).filter((item) => item.kind === 'pedal');
  expect(items.map((item) => item.text)).toEqual([
    '',
    'Change gently',
    'Sostenuto pedal: Hold the bass',
    'Soft pedal',
  ]);
  expect(items.map((item) => item.pedal)).toEqual(['sustain', 'sustain', 'sostenuto', 'soft']);
});
