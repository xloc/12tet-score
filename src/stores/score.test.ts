import { afterEach, expect, test, vi } from 'vite-plus/test';
import { createPinia } from 'pinia';
import type { Score } from '../music';
import { score as initialScore } from '../test/score';
import { useScoreStore } from './score';

const next: Score = {
  ...initialScore,
  title: 'Loaded piece',
  ppq: 240,
  bpm: 90,
  meter: [3, 4],
  notes: [{ pitch: 72, at: 720, len: 720, voice: 1 }],
  annotations: [],
};

afterEach(() => vi.unstubAllGlobals());

test('replacing the score updates timing and resets selection while retaining layout settings', () => {
  const sheet = useScoreStore(createPinia());
  expect(sheet.score).toBeNull();
  expect(sheet.totalTicks).toBe(0);
  expect(sheet.ticksPerBar).toBe(0);
  expect(sheet.barCount).toBe(0);
  expect(sheet.selectedNotes).toEqual([]);
  expect(sheet.span).toBeNull();
  expect(sheet.variableBarWidth).toBe(false);
  sheet.load(initialScore);
  sheet.selection = { kind: 'notes', indices: [548] };
  sheet.foldThreshold = 6;
  sheet.variableBarWidth = true;
  sheet.load(next);
  expect(sheet.score).toEqual(next);
  expect(sheet.totalTicks).toBe(1440);
  expect(sheet.ticksPerBar).toBe(720);
  expect(sheet.barCount).toBe(2);
  expect(sheet.selection).toEqual({ kind: 'notes', indices: [] });
  expect(sheet.selectedNotes).toEqual([]);
  expect(sheet.span).toBeNull();
  expect(sheet.foldThreshold).toBe(6);
  expect(sheet.variableBarWidth).toBe(true);
  sheet.selection = { kind: 'range', from: 720, to: 960 };
  expect(sheet.selectedNotes).toEqual(next.notes);
  expect(sheet.span).toEqual({ from: 720, to: 960 });
});

test('a local JSON file loads into the active score', async () => {
  const sheet = useScoreStore(createPinia());
  await sheet.loadFile(
    new File([JSON.stringify(next)], 'piece.json', { type: 'application/json' }),
  );
  expect(sheet.score).toEqual(next);
});

test('file loading accepts JSON names or MIME types and rejects other files without replacing the score', async () => {
  const sheet = useScoreStore(createPinia());
  const json = JSON.stringify(next);
  expect(await sheet.loadFile(new File([json], 'piece.JSON'))).toBe(true);
  expect(await sheet.loadFile(new File([json], 'piece', { type: 'application/json' }))).toBe(true);
  expect(await sheet.loadFile(new File([json], 'piece.txt', { type: 'text/plain' }))).toBe(false);
  expect(sheet.error).toBe('Choose a JSON score file.');
  expect(sheet.score).toEqual(next);
});

test('a hosted JSON score loads after a successful response', async () => {
  const sheet = useScoreStore(createPinia());
  const fetchScore = vi.fn().mockResolvedValue(new Response(JSON.stringify(next)));
  vi.stubGlobal('fetch', fetchScore);
  await sheet.loadHosted('piece.json');
  expect(fetchScore).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}scores/piece.json`);
  expect(sheet.score).toEqual(next);
});

test('invalid JSON and failed URL requests preserve the active score and selection', async () => {
  const sheet = useScoreStore(createPinia());
  sheet.load(initialScore);
  sheet.selection = { kind: 'notes', indices: [0] };
  expect(await sheet.loadFile(new File(['invalid JSON'], 'piece.json'))).toBe(false);
  expect(sheet.error).not.toBe('');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
  expect(await sheet.loadHosted('missing.json')).toBe(false);
  expect(sheet.error).toBe('Could not load score (404).');
  expect(sheet.loading).toBe(false);
  expect(sheet.score).toEqual(initialScore);
  expect(sheet.selection).toEqual({ kind: 'notes', indices: [0] });
});

test('startup fetches the public catalog and loads its first entry without a hardcoded score filename', async () => {
  const sheet = useScoreStore(createPinia());
  const catalog = [
    { file: 'opening.json', title: initialScore.title, composer: initialScore.composer },
    { file: 'another.json', title: next.title, composer: next.composer },
  ];
  let ready!: (response: Response) => void;
  const fetchScore = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          ready = resolve;
        }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(initialScore)));
  vi.stubGlobal('fetch', fetchScore);
  const loading = sheet.initialize();
  expect(fetchScore).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}scores/index.json`);
  expect(sheet.score).toBeNull();
  expect(sheet.loading).toBe(true);
  ready(new Response(JSON.stringify(catalog)));
  expect(await loading).toBe(true);
  expect(fetchScore).toHaveBeenNthCalledWith(2, `${import.meta.env.BASE_URL}scores/opening.json`);
  expect(sheet.catalog).toEqual(catalog);
  expect(sheet.loading).toBe(false);
  expect(sheet.error).toBe('');
  expect(sheet.score).toEqual(initialScore);
  expect(sheet.totalTicks).toBe(67200);
  expect(sheet.ticksPerBar).toBe(1920);
  expect(sheet.barCount).toBe(35);
});

test('an empty public catalog leaves local file loading available', async () => {
  const sheet = useScoreStore(createPinia());
  const fetchScore = vi.fn().mockResolvedValue(new Response('[]'));
  vi.stubGlobal('fetch', fetchScore);
  expect(await sheet.initialize()).toBe(true);
  expect(fetchScore).toHaveBeenCalledOnce();
  expect(sheet.catalog).toEqual([]);
  expect(sheet.score).toBeNull();
  expect(sheet.loading).toBe(false);
  expect(sheet.error).toBe('');
  expect(await sheet.loadFile(new File([JSON.stringify(next)], 'local.json'))).toBe(true);
  expect(sheet.score).toEqual(next);
});

test('fetching the catalog preserves an already loaded score and its selection', async () => {
  const sheet = useScoreStore(createPinia());
  sheet.load(next);
  sheet.selection = { kind: 'notes', indices: [0] };
  const catalog = [
    { file: 'bwv846-prelude.json', title: initialScore.title, composer: initialScore.composer },
  ];
  const fetchScore = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog)));
  vi.stubGlobal('fetch', fetchScore);
  expect(await sheet.initialize()).toBe(true);
  expect(fetchScore).toHaveBeenCalledOnce();
  expect(sheet.catalog).toEqual(catalog);
  expect(sheet.score).toEqual(next);
  expect(sheet.selection).toEqual({ kind: 'notes', indices: [0] });
});

test('a failed catalog request reports its error while keeping the current score', async () => {
  const sheet = useScoreStore(createPinia());
  sheet.load(next);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
  expect(await sheet.initialize()).toBe(false);
  expect(sheet.error).toBe('Could not load score (404).');
  expect(sheet.score).toEqual(next);
  expect(sheet.loading).toBe(false);
});
