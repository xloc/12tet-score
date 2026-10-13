import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { ScoreFollower } from './following';
import type { SearchRequest, SearchResponse } from './following-search';
import { distantScore, practiceScore } from './test/score';

let receive: (event: MessageEvent<SearchRequest>) => void;
const posted: SearchResponse[] = [];

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  posted.length = 0;
  let time = 0;
  vi.stubGlobal('performance', { now: () => ++time });
  vi.stubGlobal('postMessage', (response: SearchResponse) => posted.push(response));
  vi.stubGlobal('onmessage', null);
  await import('./following-search.worker');
  receive = globalThis.onmessage as unknown as typeof receive;
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function send(request: SearchRequest) {
  receive(new MessageEvent('message', { data: request }));
}

test('the worker coalesces input windows and publishes the latest request identifier', () => {
  send({ type: 'init', generation: 1, reference: new ScoreFollower(distantScore).reference });
  send({ type: 'search', generation: 1, id: 1, pitches: [48, 50] });
  send({ type: 'search', generation: 1, id: 2, pitches: [48, 50, 52] });
  vi.runAllTimers();
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ generation: 1, id: 2 });
  expect(posted[0]!.candidates[0]).toMatchObject({ bar: 5, at: 18 });
});

test('resetting cancels a partially processed search and rejects old-generation inputs', () => {
  const large = practiceScore(...Array.from({ length: 100 }, () => [[48], [50], [52], [53]]));
  send({ type: 'init', generation: 1, reference: new ScoreFollower(large).reference });
  send({ type: 'search', generation: 1, id: 1, pitches: [48, 50, 52, 53] });
  vi.advanceTimersToNextTimer();
  expect(posted).toEqual([]);
  send({ type: 'init', generation: 2, reference: new ScoreFollower(distantScore).reference });
  send({ type: 'search', generation: 1, id: 2, pitches: [60, 62] });
  send({ type: 'search', generation: 2, id: 1, pitches: [48, 50] });
  vi.runAllTimers();
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ generation: 2, id: 1 });
  expect(posted[0]!.candidates[0]!.bar).toBe(5);
});
