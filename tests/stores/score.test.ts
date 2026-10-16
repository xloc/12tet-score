import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { createPinia } from 'pinia';
import { builtinSource } from '../../src/library';
import { useLibraryStore } from '../../src/stores/library';
import { useScoreStore } from '../../src/stores/score';
import { createCatalog, mockLibraryStorage } from '../helpers/library';
import { createScore } from '../helpers/score';

const initialScore = createScore({
  title: 'Initial score',
  notes: [{ pitch: 60, at: 0, len: 1920, groups: [] }],
});
const next = createScore({
  title: 'Loaded piece',
  ppq: 240,
  tempos: [{ at: 0, bpm: 90 }],
  meters: [{ at: 0, meter: '3/4' }],
  notes: [{ pitch: 72, at: 720, len: 720, groups: [] }],
});
const catalog = createCatalog([
  {
    id: 'opening',
    title: initialScore.title,
    composer: initialScore.composer,
    url: './opening.json',
  },
  { id: 'piece', title: next.title, composer: next.composer, url: './piece.json' },
]);
const openingRef = { sourceId: 'builtin', scoreId: 'opening' };
const nextRef = { sourceId: 'builtin', scoreId: 'piece' };

let saved: Map<string, string>;
beforeEach(() => {
  saved = mockLibraryStorage();
});
afterEach(() => vi.unstubAllGlobals());

function mockHostedScores() {
  const fetchJSON = vi.fn(async (url: string) => {
    const value = url.endsWith('index.json')
      ? catalog
      : url.endsWith('opening.json')
        ? initialScore
        : next;
    return new Response(JSON.stringify(value));
  });
  vi.stubGlobal('fetch', fetchJSON);
  return fetchJSON;
}

test('replacing the score updates musical context and resets selection while retaining layout settings', () => {
  const sheet = useScoreStore(createPinia());
  expect(sheet.score).toBeNull();
  expect(sheet.totalTicks).toBe(0);
  expect(sheet.bars).toEqual([]);
  expect(sheet.barCount).toBe(0);
  expect(sheet.selectedNotes).toEqual([]);
  expect(sheet.span).toBeNull();
  sheet.load(initialScore);
  sheet.selection = { kind: 'notes', indices: [0] };
  sheet.foldThreshold = 6;
  sheet.variableBarWidth = true;
  sheet.load(next);
  expect(sheet.totalTicks).toBe(1440);
  expect(sheet.bars[0]!.to).toBe(720);
  expect(sheet.barCount).toBe(2);
  expect(sheet.selection).toEqual({ kind: 'notes', indices: [] });
  expect(sheet.foldThreshold).toBe(6);
  expect(sheet.variableBarWidth).toBe(true);
  sheet.selection = { kind: 'range', from: 720, to: 960 };
    expect(sheet.selectedNotes.map(({ source }) => source)).toEqual(next.notes);
  expect(sheet.span).toEqual({ from: 720, to: 960 });
});

test('opening a score persists its source reference without storing score data in preferences', async () => {
  const fetchJSON = mockHostedScores();
  const sheet = useScoreStore(createPinia());
  expect(await sheet.open(nextRef)).toBe(true);
  expect(sheet.score).toEqual(next);
  expect(sheet.opened).toEqual(nextRef);
  expect(JSON.parse(saved.get('music-sheet-state')!)).toEqual({
    version: 3,
    opened: nextRef,
    foldThreshold: 12,
    variableBarWidth: false,
  });
  expect(fetchJSON).toHaveBeenLastCalledWith('https://app.example/scores/piece.json', {
    cache: 'no-cache',
    credentials: 'omit',
  });
});

test('an imported score and display preferences restore without any network request', async () => {
  let pinia = createPinia();
  let library = useLibraryStore(pinia);
  let sheet = useScoreStore(pinia);
  const refs = await library.importFiles([new File([JSON.stringify(next)], 'piece.json')]);
  await sheet.open(refs[0]!);
  sheet.foldThreshold = 0;
  sheet.variableBarWidth = true;
  sheet.selection = { kind: 'notes', indices: [0] };
  sheet.$dispose();
  library.$dispose();
  const fetchJSON = vi.fn();
  vi.stubGlobal('fetch', fetchJSON);
  pinia = createPinia();
  library = useLibraryStore(pinia);
  sheet = useScoreStore(pinia);
  expect(await sheet.initialize()).toBe(true);
  expect(sheet.score).toEqual(next);
  expect(sheet.opened).toEqual(refs[0]);
  expect(sheet.foldThreshold).toBe(0);
  expect(sheet.variableBarWidth).toBe(true);
  expect(sheet.selection).toEqual({ kind: 'notes', indices: [] });
  expect(await library.list('local')).toHaveLength(1);
  expect(fetchJSON).not.toHaveBeenCalled();
});

test('startup opens the first built-in entry and restoration reads fresh score data', async () => {
  const fetchJSON = mockHostedScores();
  let sheet = useScoreStore(createPinia());
  expect(await sheet.initialize()).toBe(true);
  expect(sheet.score).toEqual(initialScore);
  expect(sheet.opened).toEqual(openingRef);
  expect(fetchJSON).toHaveBeenCalledWith(builtinSource.url, {
    cache: 'no-cache',
    credentials: 'omit',
  });
  await sheet.open(nextRef);
  sheet.$dispose();
  const updated = { ...next, title: 'Updated edition' };
  fetchJSON.mockImplementation(
    async (url) => new Response(JSON.stringify(url.endsWith('index.json') ? catalog : updated)),
  );
  sheet = useScoreStore(createPinia());
  expect(await sheet.initialize()).toBe(true);
  expect(sheet.score).toEqual(updated);
  expect(sheet.opened).toEqual(nextRef);
});

test('a registered remote score restores its source-scoped ID with no built-in catalog request', async () => {
  const remote = createCatalog(
    [{ id: 'piece', title: next.title, composer: next.composer, url: './piece.json' }],
    'Site',
  );
  const fetchJSON = vi.fn(
    async (url: string) => new Response(JSON.stringify(url.endsWith('index.json') ? remote : next)),
  );
  vi.stubGlobal('fetch', fetchJSON);
  let pinia = createPinia();
  const added = (await useLibraryStore(pinia).addSite('https://site.example/music/index.json'))!;
  let sheet = useScoreStore(pinia);
  const ref = { sourceId: added.id, scoreId: 'piece' };
  await sheet.open(ref);
  sheet.$dispose();
  fetchJSON.mockClear();
  pinia = createPinia();
  sheet = useScoreStore(pinia);
  expect(await sheet.initialize()).toBe(true);
  expect(sheet.opened).toEqual(ref);
  expect(sheet.score).toEqual(next);
  expect(fetchJSON.mock.calls.map(([url]) => url)).toEqual([
    'https://site.example/music/index.json',
    'https://site.example/music/piece.json',
  ]);
});

test.each([
  { sourceId: 'removed-site', scoreId: 'piece' },
  { sourceId: 'builtin', scoreId: 'removed-score' },
  { sourceId: 'local', scoreId: 'deleted-import' },
])('a removed last-opened entry falls back to examples: %j', async (opened) => {
  saved.set('music-sheet-state', JSON.stringify({ version: 3, opened, foldThreshold: 6 }));
  mockHostedScores();
  const sheet = useScoreStore(createPinia());
  expect(await sheet.initialize()).toBe(true);
  expect(sheet.opened).toEqual(openingRef);
  expect(sheet.foldThreshold).toBe(6);
});

test('an empty or failed examples catalog leaves importing and opening local scores available', async () => {
  const fetchJSON = vi.fn(async () => new Response('', { status: 503 }));
  vi.stubGlobal('fetch', fetchJSON);
  const pinia = createPinia();
  const sheet = useScoreStore(pinia);
  const library = useLibraryStore(pinia);
  expect(await sheet.initialize()).toBe(false);
  expect(sheet.error).toContain('503');
  fetchJSON.mockImplementation(async () => new Response(JSON.stringify(createCatalog())));
  expect(await sheet.initialize()).toBe(true);
  expect(sheet.score).toBeNull();
  const refs = await library.importFiles([new File([JSON.stringify(next)], 'piece.json')]);
  expect(await sheet.open(refs[0]!)).toBe(true);
  expect(sheet.score).toEqual(next);
});

test('invalid fetched data and failed score requests preserve the active score, reference, and selection', async () => {
  const fetchJSON = mockHostedScores();
  const sheet = useScoreStore(createPinia());
  await sheet.open(openingRef);
  sheet.selection = { kind: 'notes', indices: [0] };
  for (const response of [
    new Response('invalid JSON'),
    new Response(JSON.stringify(createScore({ ppq: 0 }))),
    new Response('', { status: 404 }),
  ]) {
    fetchJSON.mockResolvedValueOnce(response);
    expect(await sheet.open(nextRef)).toBe(false);
    expect(sheet.score).toEqual(initialScore);
    expect(sheet.opened).toEqual(openingRef);
    expect(sheet.selection).toEqual({ kind: 'notes', indices: [0] });
    expect(sheet.loading).toBe(false);
    expect(sheet.error).not.toBe('');
  }
});

test('the latest requested score wins when responses finish out of order', async () => {
  const fetchJSON = mockHostedScores();
  const pinia = createPinia();
  const sheet = useScoreStore(pinia);
  await useLibraryStore(pinia).list('builtin');
  let finish!: (response: Response) => void;
  fetchJSON.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const old = sheet.open(openingRef);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  expect(await sheet.open(nextRef)).toBe(true);
  finish(new Response(JSON.stringify(initialScore)));
  expect(await old).toBe(false);
  expect(sheet.score).toEqual(next);
  expect(sheet.opened).toEqual(nextRef);
  expect(sheet.loading).toBe(false);
});

test('initial catalog loading cannot replace a local score opened while startup was pending', async () => {
  const pinia = createPinia();
  const library = useLibraryStore(pinia);
  const refs = await library.importFiles([new File([JSON.stringify(next)], 'local.json')]);
  const sheet = useScoreStore(pinia);
  let finish!: (response: Response) => void;
  const fetchJSON = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetchJSON);
  const starting = sheet.initialize();
  expect(await sheet.open(refs[0]!)).toBe(true);
  finish(new Response(JSON.stringify(catalog)));
  expect(await starting).toBe(false);
  expect(sheet.score).toEqual(next);
  expect(sheet.opened).toEqual(refs[0]);
  expect(fetchJSON).toHaveBeenCalledOnce();
});

test('removing a site during score loading preserves the previously open score', async () => {
  const fetchJSON = mockHostedScores();
  const pinia = createPinia();
  const library = useLibraryStore(pinia);
  const sheet = useScoreStore(pinia);
  await sheet.open(openingRef);
  library.sites.push({
    id: 'site',
    kind: 'catalog',
    name: 'Site',
    url: 'https://site.example/index.json',
  });
  library.listings.site = {
    loaded: true,
    loading: false,
    error: '',
    entries: [{ id: 'piece', title: 'Piece', composer: '', url: './piece.json' }],
  };
  let finish!: (response: Response) => void;
  fetchJSON.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const opening = sheet.open({ sourceId: 'site', scoreId: 'piece' });
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  library.removeSite('site');
  finish(new Response(JSON.stringify(next)));
  expect(await opening).toBe(false);
  expect(sheet.score).toEqual(initialScore);
  expect(sheet.opened).toEqual(openingRef);
});

test('catalog refreshes preserve an active score and its selection', async () => {
  mockHostedScores();
  const pinia = createPinia();
  const sheet = useScoreStore(pinia);
  await sheet.open(openingRef);
  sheet.selection = { kind: 'notes', indices: [0] };
  await useLibraryStore(pinia).refresh('builtin');
  expect(sheet.score).toEqual(initialScore);
  expect(sheet.selection).toEqual({ kind: 'notes', indices: [0] });
});

test('a built-in hot update reloads only its active score and keeps layout settings', async () => {
  const fetchJSON = mockHostedScores();
  const pinia = createPinia();
  const sheet = useScoreStore(pinia);
  await sheet.open(nextRef);
  sheet.foldThreshold = 3;
  sheet.variableBarWidth = true;
  const updated = { ...next, title: 'Updated piece' };
  fetchJSON.mockImplementation(
    async (url) => new Response(JSON.stringify(url.endsWith('index.json') ? catalog : updated)),
  );
  expect(await sheet.refreshBuiltin('piece')).toBe(true);
  expect(sheet.score).toEqual(updated);
  expect(sheet.foldThreshold).toBe(3);
  expect(sheet.variableBarWidth).toBe(true);
  const refs = await useLibraryStore(pinia).importFiles([
    new File([JSON.stringify(initialScore)], 'piece.json'),
  ]);
  await sheet.open(refs[0]!);
  expect(await sheet.refreshBuiltin('piece')).toBe(false);
  expect(sheet.score).toEqual(initialScore);
});

test('a pending hot update cannot replace a newer local selection', async () => {
  const fetchJSON = mockHostedScores();
  const pinia = createPinia();
  const library = useLibraryStore(pinia);
  const refs = await library.importFiles([new File([JSON.stringify(initialScore)], 'local.json')]);
  const sheet = useScoreStore(pinia);
  await sheet.open(nextRef);
  let finish!: (response: Response) => void;
  fetchJSON.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const refreshing = sheet.refreshBuiltin('piece');
  await sheet.open(refs[0]!);
  finish(new Response(JSON.stringify(catalog)));
  expect(await refreshing).toBe(false);
  expect(sheet.score).toEqual(initialScore);
  expect(sheet.opened).toEqual(refs[0]);
});

test('legacy single-score caches are discarded while layout preferences are retained', async () => {
  saved.set(
    'music-sheet-state',
    JSON.stringify({
      version: 1,
      opened: { score: next },
      foldThreshold: 6,
      variableBarWidth: true,
    }),
  );
  mockHostedScores();
  const sheet = useScoreStore(createPinia());
  expect(await sheet.initialize()).toBe(true);
  expect(sheet.score).toEqual(initialScore);
  expect(sheet.foldThreshold).toBe(6);
  expect(sheet.variableBarWidth).toBe(true);
});

test('blocked preference storage leaves library reads and display controls usable', async () => {
  vi.stubGlobal('localStorage', {
    getItem() {
      throw new Error('Blocked');
    },
    setItem() {
      throw new Error('Blocked');
    },
  });
  mockHostedScores();
  const sheet = useScoreStore(createPinia());
  expect(await sheet.open(nextRef)).toBe(true);
  sheet.foldThreshold = 0;
  sheet.variableBarWidth = true;
  expect(sheet.score).toEqual(next);
  expect(sheet.error).toBe('');
});
