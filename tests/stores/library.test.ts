import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { createPinia } from 'pinia';
import { builtinSource, catalogScoreUrl, readCatalog } from '../../src/library';
import { listLocalScores, saveLocalScores } from '../../src/local-scores';
import { useLibraryStore } from '../../src/stores/library';
import { useScoreStore } from '../../src/stores/score';
import { createScore } from '../helpers/score';
import { createCatalog, mockLibraryStorage } from '../helpers/library';

let saved: Map<string, string>;
beforeEach(() => {
  saved = mockLibraryStorage();
});
afterEach(() => vi.unstubAllGlobals());

test('multiple imports and repeated filenames retain separate scores after recreating the library', async () => {
  const first = createScore({ title: 'First piece' });
  const second = createScore({ title: 'Second piece' });
  let library = useLibraryStore(createPinia());
  const refs = await library.importFiles([
    new File([JSON.stringify(first)], 'piece.json'),
    new File([JSON.stringify(second)], 'piece.json'),
  ]);
  expect(refs).toHaveLength(2);
  expect(new Set(refs.map((ref) => ref.scoreId)).size).toBe(2);
  expect(library.importError).toBe('');
  library.$dispose();
  library = useLibraryStore(createPinia());
  expect((await library.list('local')).map((entry) => entry.title).sort()).toEqual([
    'First piece',
    'Second piece',
  ]);
  expect(await library.read(refs[0]!)).toEqual(first);
  expect(await library.read(refs[1]!)).toEqual(second);
  expect(saved.has('music-sheet-state')).toBe(false);
});

test('importing later files preserves the previous library and the active selection', async () => {
  const pinia = createPinia();
  const library = useLibraryStore(pinia);
  const sheet = useScoreStore(pinia);
  const first = createScore({
    title: 'First',
    notes: [{ pitch: 60, at: 0, len: 480, groups: [] }],
  });
  const refs = await library.importFiles([new File([JSON.stringify(first)], 'first.json')]);
  await sheet.open(refs[0]!);
  sheet.selection = { kind: 'notes', indices: [0] };
  await library.importFiles([
    new File([JSON.stringify(createScore({ title: 'Second' }))], 'second.json'),
  ]);
  expect(await library.list('local')).toHaveLength(2);
  expect(sheet.score).toEqual(first);
  expect(sheet.opened).toEqual(refs[0]);
  expect(sheet.selection).toEqual({ kind: 'notes', indices: [0] });
});

test('a batch retains valid JSON files and reports invalid files individually', async () => {
  const library = useLibraryStore(createPinia());
  const json = JSON.stringify(createScore());
  const refs = await library.importFiles([
    new File([json], 'valid.JSON'),
    new File([json], 'mime-only', { type: 'application/json' }),
    new File(['invalid JSON'], 'broken.json'),
    new File([JSON.stringify(createScore({ ppq: 0 }))], 'timing.json'),
    new File([json], 'wrong.txt'),
  ]);
  expect(refs).toHaveLength(2);
  expect(await library.list('local')).toHaveLength(2);
  expect(library.importError).toContain('broken.json:');
  expect(library.importError).toContain('timing.json: PPQ must be positive.');
  expect(library.importError).toContain('wrong.txt: Choose a JSON score file.');
  expect(library.importing).toBe(false);
});

test('removing an imported score persists without removing other scores or the active snapshot', async () => {
  const pinia = createPinia();
  const library = useLibraryStore(pinia);
  const sheet = useScoreStore(pinia);
  const refs = await library.importFiles([
    new File([JSON.stringify(createScore({ title: 'One' }))], 'one.json'),
    new File([JSON.stringify(createScore({ title: 'Two' }))], 'two.json'),
  ]);
  await sheet.open(refs[0]!);
  await library.removeLocal(refs[0]!.scoreId);
  const reloaded = useLibraryStore(createPinia());
  expect(await reloaded.list('local')).toHaveLength(1);
  await expect(reloaded.read(refs[0]!)).rejects.toThrow('no longer');
  expect((await reloaded.read(refs[1]!)).title).toBe('Two');
  expect(sheet.score?.title).toBe('One');
});

test('a failed IndexedDB transaction rolls back the whole imported batch', async () => {
  const first = { id: 'existing', score: createScore({ title: 'Existing' }) };
  await saveLocalScores([first]);
  await expect(
    saveLocalScores([{ id: 'new', score: createScore({ title: 'New' }) }, first]),
  ).rejects.toThrow();
  expect(await listLocalScores()).toEqual([first]);
});

test('unavailable local storage reports failed imports while catalog sources still work', async () => {
  vi.stubGlobal('indexedDB', undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(createCatalog()))),
  );
  const library = useLibraryStore(createPinia());
  expect(
    await library.importFiles([new File([JSON.stringify(createScore())], 'piece.json')]),
  ).toEqual([]);
  expect(library.importError).toContain('Local score storage is unavailable');
  expect(library.listings.local?.entries).toEqual([]);
  expect(await library.list('builtin')).toEqual([]);
});

test('multiple sites with overlapping score IDs resolve relative URLs and persist their identities', async () => {
  const firstCatalog = createCatalog(
    [{ id: 'piece', title: 'One', composer: 'Composer', url: './scores/one.json' }],
    'Site one',
  );
  const secondCatalog = createCatalog(
    [{ id: 'piece', title: 'Two', composer: 'Composer', url: '../two.json' }],
    'Site two',
  );
  const responses: Record<string, unknown> = {
    'https://one.example/music/index.json': firstCatalog,
    'https://two.example/catalog/index.json': secondCatalog,
    'https://one.example/music/scores/one.json': createScore({ title: 'One' }),
    'https://two.example/two.json': createScore({ title: 'Two' }),
  };
  const fetchJSON = vi.fn(async (url: string) => new Response(JSON.stringify(responses[url])));
  vi.stubGlobal('fetch', fetchJSON);
  let library = useLibraryStore(createPinia());
  const first = (await library.addSite('https://one.example/music/index.json'))!;
  const second = (await library.addSite('https://two.example/catalog/index.json'))!;
  expect((await library.read({ sourceId: first.id, scoreId: 'piece' })).title).toBe('One');
  expect((await library.read({ sourceId: second.id, scoreId: 'piece' })).title).toBe('Two');
  expect(fetchJSON).toHaveBeenCalledWith('https://two.example/two.json', {
    cache: 'no-cache',
    credentials: 'omit',
  });
  expect(JSON.parse(saved.get('music-sheet-sites')!)).toHaveLength(2);
  library.$dispose();
  fetchJSON.mockClear();
  library = useLibraryStore(createPinia());
  expect(library.sources.map((source) => source.id)).toEqual([
    'builtin',
    'local',
    first.id,
    second.id,
  ]);
  expect(fetchJSON).not.toHaveBeenCalled();
  expect((await library.read({ sourceId: first.id, scoreId: 'piece' })).title).toBe('One');
  expect(fetchJSON).toHaveBeenCalledTimes(2);
});

test('adding the same catalog twice returns the existing source and removing it leaves permanent sources intact', async () => {
  const fetchJSON = vi.fn(async () => new Response(JSON.stringify(createCatalog([], 'Site'))));
  vi.stubGlobal('fetch', fetchJSON);
  const library = useLibraryStore(createPinia());
  const added = (await library.addSite(' https://site.example/index.json#catalog '))!;
  expect((await library.addSite('https://site.example/index.json'))?.id).toBe(added.id);
  expect(fetchJSON).toHaveBeenCalledOnce();
  library.removeSite('builtin');
  library.removeSite('local');
  expect(library.sources).toHaveLength(3);
  library.removeSite(added.id);
  expect(library.sources.map((source) => source.id)).toEqual(['builtin', 'local']);
  expect(library.listings[added.id]).toBeUndefined();
  expect(JSON.parse(saved.get('music-sheet-sites')!)).toEqual([]);
});

test('a failed catalog refresh retains the last listing and isolates its error from other sources', async () => {
  const entry = { id: 'piece', title: 'Piece', composer: 'Composer', url: './piece.json' };
  const fetchJSON = vi.fn(async () => new Response(JSON.stringify(createCatalog([entry], 'Site'))));
  vi.stubGlobal('fetch', fetchJSON);
  const library = useLibraryStore(createPinia());
  const added = (await library.addSite('https://site.example/index.json'))!;
  fetchJSON.mockImplementation(async () => new Response('', { status: 503 }));
  await expect(library.refresh(added.id)).rejects.toThrow('503');
  expect(await library.list(added.id)).toEqual([entry]);
  expect(library.listings[added.id]?.error).toContain('503');
  expect(await library.list('local')).toEqual([]);
  expect(library.listings.local?.error).toBe('');
  expect(library.listings[added.id]?.loading).toBe(false);
});

test('concurrent initial listing requests share one fetch and recover after a failed request', async () => {
  let finish!: (response: Response) => void;
  const fetchJSON = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetchJSON);
  const library = useLibraryStore(createPinia());
  const first = library.list('builtin');
  const second = library.list('builtin');
  expect(fetchJSON).toHaveBeenCalledOnce();
  const failures = Promise.allSettled([first, second]);
  finish(new Response('', { status: 404 }));
  for (const result of await failures) {
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason.message).toContain('404');
  }
  fetchJSON.mockImplementation(async () => new Response(JSON.stringify(createCatalog())));
  expect(await library.list('builtin')).toEqual([]);
  expect(library.listings.builtin?.error).toBe('');
});

test('removing a site during refresh prevents its delayed listing from returning to the library', async () => {
  const fetchJSON = vi.fn(async () => new Response(JSON.stringify(createCatalog([], 'Site'))));
  vi.stubGlobal('fetch', fetchJSON);
  const library = useLibraryStore(createPinia());
  const added = (await library.addSite('https://site.example/index.json'))!;
  let finish!: (response: Response) => void;
  fetchJSON.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const refresh = library.refresh(added.id);
  library.removeSite(added.id);
  finish(new Response(JSON.stringify(createCatalog([], 'Renamed site'))));
  await expect(refresh).rejects.toThrow('removed');
  expect(library.listings[added.id]).toBeUndefined();
  expect(library.sites).toEqual([]);
});

test.each([
  { version: 2, name: 'Site', scores: [] },
  { version: 1, name: 'Site', scores: [{ id: 'piece' }] },
  createCatalog([
    { id: 'same', title: 'One', composer: '', url: './one.json' },
    { id: 'same', title: 'Two', composer: '', url: './two.json' },
  ]),
  createCatalog([{ id: 'piece', title: 'Piece', composer: '', url: 'file:///piece.json' }]),
])('invalid catalogs are rejected before registering a site: %j', async (catalog) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(catalog))),
  );
  const library = useLibraryStore(createPinia());
  expect(await library.addSite('https://site.example/index.json')).toBeNull();
  expect(library.siteError).not.toBe('');
  expect(library.sites).toEqual([]);
});

test('built-in catalog URLs work under a nested app path and unsupported site URL schemes are rejected', async () => {
  const fetchJSON = vi.fn(
    async () =>
      new Response(
        JSON.stringify(
          createCatalog([{ id: 'piece', title: 'Piece', composer: '', url: './piece.json' }]),
        ),
      ),
  );
  vi.stubGlobal('fetch', fetchJSON);
  const library = useLibraryStore(createPinia());
  expect(catalogScoreUrl('./scores/index.json', './piece.json')).toBe(
    'https://app.example/music/scores/piece.json',
  );
  expect(catalogScoreUrl('/other/scores/index.json', './piece.json')).toBe(
    'https://app.example/other/scores/piece.json',
  );
  await readCatalog(builtinSource.url);
  expect(await library.addSite('file:///index.json')).toBeNull();
  expect(library.siteError).toBe('Catalog URLs must use HTTP or HTTPS.');
  expect(await library.addSite('invalid URL')).toBeNull();
  expect(fetchJSON).toHaveBeenCalledOnce();
});
