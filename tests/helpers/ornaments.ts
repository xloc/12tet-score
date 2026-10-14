import { createScore } from './score';

export const mainPitches = [60, 64, 67, 62, 69, 71];
export const ornamentPitches = [
  60, 59, 60, 64, 65, 64, 67, 65, 67, 64, 62, 60, 62, 69, 71, 69, 71, 72, 71,
];

export function ornamentScore() {
  return createScore({
    duration: 11520,
    groups: [{ id: 'rh', kind: 'hand', hand: 'right', name: 'Right hand' }],
    notes: [
      ...[80, 82, 84, 86].map((pitch, index) => ({
        pitch,
        at: index * 1920,
        len: 1920,
        groups: ['rh'],
      })),
      {
        pitch: 60,
        at: 7680,
        len: 480,
        groups: ['rh'],
        ornament: { timing: 'atStart', pitches: [60, 59], len: 60 },
      },
      {
        pitch: 64,
        at: 8160,
        len: 480,
        groups: ['rh'],
        ornament: { timing: 'atStart', pitches: [64, 65], len: 60 },
      },
      {
        pitch: 67,
        at: 8640,
        len: 480,
        groups: ['rh'],
        ornament: { timing: 'atStart', pitches: [67, 65], len: 60 },
      },
      {
        pitch: 62,
        at: 9120,
        len: 480,
        groups: ['rh'],
        ornament: { timing: 'atStart', pitches: [64, 62, 60], len: 90 },
      },
      {
        pitch: 69,
        at: 9600,
        len: 480,
        groups: ['rh'],
        ornament: { timing: 'atStart', pitches: [69, 71], len: 60 },
      },
      {
        pitch: 71,
        at: 10080,
        len: 480,
        groups: ['rh'],
        ornament: { timing: 'atStart', pitches: [71, 72], len: 60 },
      },
    ],
  });
}
