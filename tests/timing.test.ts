import { expect, test } from 'vite-plus/test';
import { scoreBars, secondsAt, tickAtSeconds } from '../src/timing';
import { scoreLines } from '../src/layout';
import { scoreDuration } from '../src/music';
import { createScore } from './helpers/score';

const meters = [
  { at: 0, meter: '4/4' },
  { at: 3840, meter: '3/4' },
  { at: 6720, meter: '6/8' },
];
const tempos = [
  { at: 0, bpm: 60 },
  { at: 960, bpm: 120 },
  { at: 1920, bpm: 90 },
];

test('meter changes generate contiguous bars and denominator-based beat guides', () => {
  const bars = scoreBars(8160, 480, meters);
  expect(bars.map(({ from, to, meter, number }) => ({ from, to, meter, number }))).toEqual([
    { from: 0, to: 1920, meter: '4/4', number: 1 },
    { from: 1920, to: 3840, meter: '4/4', number: 2 },
    { from: 3840, to: 5280, meter: '3/4', number: 3 },
    { from: 5280, to: 6720, meter: '3/4', number: 4 },
    { from: 6720, to: 8160, meter: '6/8', number: 5 },
  ]);
  const lines = scoreLines([], 8160, {
    ppq: 480,
    meters,
    sections: [{ at: 5280, title: 'New section' }],
    width: 4096,
    rem: 16,
    foldThreshold: 12,
    variableBarWidth: true,
  });
  expect(lines.map((line) => line.from)).toEqual([0, 5280]);
  expect(
    lines
      .at(-1)!
      .bars.at(-1)!
      .beats.map((beat) => beat.from),
  ).toEqual([6720, 6960, 7200, 7440, 7680, 7920]);
});

test('invalid meter changes and section starts cannot split a bar', () => {
  expect(() =>
    scoreBars(3840, 480, [
      { at: 0, meter: '4/4' },
      { at: 480, meter: '3/4' },
    ]),
  ).toThrow('bar boundary');
  expect(() =>
    scoreBars(3840, 480, [{ at: 0, meter: '4/4' }], [{ at: 480, title: 'Section' }]),
  ).toThrow('bar boundary');
  for (const meter of ['4/0', '0/4', 'four/four'])
    expect(() => scoreBars(3840, 480, [{ at: 0, meter }])).toThrow('Invalid meter');
});

test('a pickup precedes the first full bar without changing the meter', () => {
  const meters = [{ at: 0, meter: '3/8' }];
  const bars = scoreBars(1920, 480, meters, [], 240);
  expect(bars.map(({ from, to, number }) => ({ from, to, number }))).toEqual([
    { from: 0, to: 240, number: 0 },
    { from: 240, to: 960, number: 1 },
    { from: 960, to: 1680, number: 2 },
    { from: 1680, to: 1920, number: 3 },
  ]);
  expect(bars.every((bar) => bar.meter === '3/8' && bar.beatTicks === 240)).toBe(true);
  const lines = scoreLines([], 1920, {
    ppq: 480,
    meters,
    pickup: 240,
    width: 512,
    rem: 16,
    foldThreshold: 12,
    variableBarWidth: false,
  });
  expect(lines.flatMap((line) => line.bars).map((bar) => [bar.from, bar.to])).toEqual(
    bars.map((bar) => [bar.from, bar.to]),
  );
  for (const pickup of [-1, 720, NaN])
    expect(() => scoreBars(1920, 480, meters, [], pickup)).toThrow('Pickup');
});

test('tempo changes integrate elapsed seconds and invert exactly, including practice speed', () => {
  expect(secondsAt(960, tempos, 480)).toBe(2);
  expect(secondsAt(1920, tempos, 480)).toBe(3);
  expect(secondsAt(3360, tempos, 480)).toBe(5);
  for (const speed of [0.5, 1, 2]) {
    for (const tick of [0, 480, 960, 1440, 1920, 2400, 3360, 7000]) {
      expect(tickAtSeconds(secondsAt(tick, tempos, 480, speed), tempos, 480, speed)).toBeCloseTo(
        tick,
      );
    }
  }
});

test('annotation and pedal intervals retain trailing silent score time', () => {
  expect(
    scoreDuration(
      createScore({
        annotations: [{ at: 0, len: 960, text: 'Rest' }],
        pedals: [{ at: 0, len: 1920, type: 'sustain' }],
      }),
    ),
  ).toBe(1920);
});

test('explicit duration retains the final rest without truncating sounding notes', () => {
  const score = createScore({
    duration: 1920,
    notes: [{ at: 0, len: 1440, pitch: 60, groups: [] }],
  });
  expect(scoreDuration(score)).toBe(1920);
  expect(scoreDuration({ ...score, duration: 480 })).toBe(1440);
});
