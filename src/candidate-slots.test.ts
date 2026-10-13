import { expect, test } from 'vite-plus/test';
import { candidateSlots } from './candidate-slots';

test('score changes keep the same candidates in their original slots', () => {
  const original = candidateSlots([undefined, undefined, undefined], [3, 4, 5]);
  expect(original).toEqual([3, 4, 5]);
  expect(candidateSlots(original, [5, 3, 4])).toEqual([3, 4, 5]);
  expect(original).toEqual([3, 4, 5]);
});

test('new candidates replace only vacated slots without moving surviving candidates', () => {
  expect(candidateSlots([3, 4, 5], [6, 5, 3, 4])).toEqual([3, 6, 5]);
  expect(candidateSlots([3, 6, 5], [5])).toEqual([undefined, undefined, 5]);
  expect(candidateSlots([3, 6, 5], [])).toEqual([undefined, undefined, undefined]);
});

test('multiple interpretations of one bar occupy a single slot', () => {
  expect(candidateSlots([undefined, undefined, undefined], [3, 3, 6, 5, 4])).toEqual([3, 6, 5]);
});
