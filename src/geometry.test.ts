import { expect, test } from 'vite-plus/test';
import { measureScoreLine } from './geometry';
import { notePlacement, positionAtTick, scoreLines, tickAtPosition, timePlacement } from './music';
import { tickAtPoint } from './selection';

function measuredRow() {
  const bars = [
    { from: 0, to: 1920, left: 40.25, width: 409.59375 },
    { from: 1920, to: 3840, left: 449.84375, width: 102.40625 },
  ];
  const element = {
    getBoundingClientRect: () => ({ left: 40.25, width: 512 }),
    querySelectorAll: () =>
      bars.map((bar) => ({
        dataset: { barFrom: String(bar.from), barTo: String(bar.to) },
        getBoundingClientRect: () => ({ left: bar.left, width: bar.width }),
      })),
  } as unknown as HTMLElement;
  return measureScoreLine(element);
}

test('bar geometry uses the browser’s final fractional widths and positions', () => {
  expect(measuredRow()).toEqual({
    width: 512,
    bars: [
      { from: 0, to: 1920, left: 0, width: 409.59375 },
      { from: 1920, to: 3840, left: 409.59375, width: 102.40625 },
    ],
  });
});

test('playback, seeking, and time ranges agree with measured bar boundaries', () => {
  const geometry = measuredRow();
  const line = { ...geometry, from: 0, to: 3840, left: 40.25, right: 552.25, top: 0, bottom: 100 };
  for (const tick of [0, 120, 1440, 1920, 2040, 2880, 3840]) {
    const x = positionAtTick(tick, geometry.bars);
    expect(tickAtPosition(x, geometry.bars)).toBeCloseTo(tick);
    expect(tickAtPoint({ x: line.left + x, y: 50 }, [line], 480)).toBe(tick);
  }
  const placement = timePlacement(1920, 2880, geometry);
  expect((parseFloat(placement.left) * 512) / 100).toBeCloseTo(409.59375);
  expect((parseFloat(placement.width) * 512) / 100).toBeCloseTo(102.40625 / 2);
});

test('a cross-bar held note stays continuous after browser geometry changes', () => {
  const note = { pitch: 60, at: 1440, len: 2400, voice: 1 };
  const line = scoreLines([note], 3840, {
    ppq: 480,
    ticksPerBar: 1920,
    width: 512,
    rem: 16,
    foldThreshold: 12,
    variableBarWidth: true,
  })[0]!;
  for (const geometry of [
    measuredRow(),
    {
      width: 800,
      bars: [
        { from: 0, to: 1920, left: 0, width: 600 },
        { from: 1920, to: 3840, left: 600, width: 200 },
      ],
    },
  ]) {
    const placement = notePlacement(note, line, geometry);
    expect(parseFloat(placement.left!) + parseFloat(placement.width!)).toBeCloseTo(100);
    expect(positionAtTick(1920, geometry.bars)).toBe(geometry.bars[1]!.left);
  }
});
