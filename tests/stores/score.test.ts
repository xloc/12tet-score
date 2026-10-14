import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { createPinia } from 'pinia';
import { createScore } from '../helpers/score';
import { useScoreStore } from '../../src/stores/score';

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

let saved: Map<string, string>;
beforeEach(() => {
  saved = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
});

afterEach(() => vi.unstubAllGlobals());

test('replacing the score updates timing and resets selection while retaining layout settings', () => {
  const sheet = useScoreStore(createPinia());
  expect(sheet.score).toBeNull();
  expect(sheet.totalTicks).toBe(0);
  expect(sheet.bars).toEqual([]);
  expect(sheet.barCount).toBe(0);
  expect(sheet.selectedNotes).toEqual([]);
  expect(sheet.span).toBeNull();
  expect(sheet.foldThreshold).toBe(12);
  expect(sheet.variableBarWidth).toBe(false);
  sheet.load(initialScore);
  sheet.selection = { kind: 'notes', indices: [0] };
  sheet.foldThreshold = 6;
  sheet.variableBarWidth = true;
  sheet.load(next);
  expect(sheet.score).toEqual(next);
  expect(sheet.totalTicks).toBe(1440);
  expect(sheet.bars[0]!.to).toBe(720);
  expect(sheet.barCount).toBe(2);
  expect(sheet.selection).toEqual({ kind: 'notes', indices: [] });
  expect(sheet.selectedNotes).toEqual([]);
  expect(sheet.span).toBeNull();
  expect(sheet.foldThreshold).toBe(6);
  expect(sheet.variableBarWidth).toBe(true);
  sheet.selection = { kind: 'range', from: 720, to: 960 };
  expect(sheet.selectedNotes.map(({ source }) => source)).toEqual(next.notes);
  expect(sheet.span).toEqual({ from: 720, to: 960 });
});

test('a local JSON file loads into the active score', async () => {
  const sheet = useScoreStore(createPinia());
  await sheet.loadFile(
    new File([JSON.stringify(next)], 'piece.json', { type: 'application/json' }),
  );
  expect(sheet.score).toEqual(next);
});

test('layout settings survive refresh, including folding off and uniform bar widths', () => {
  let sheet = useScoreStore(createPinia());
  sheet.foldThreshold = 0;
  sheet.variableBarWidth = true;
  sheet.$dispose();
  sheet = useScoreStore(createPinia());
  expect(sheet.foldThreshold).toBe(0);
  expect(sheet.variableBarWidth).toBe(true);
  sheet.foldThreshold = 6;
  sheet.variableBarWidth = false;
  sheet.$dispose();
  sheet = useScoreStore(createPinia());
  expect(sheet.foldThreshold).toBe(6);
  expect(sheet.variableBarWidth).toBe(false);
});

test('refresh restores an uploaded score and its layout settings instead of the first catalog entry', async () => {
  let sheet = useScoreStore(createPinia());
  await sheet.loadFile(new File([JSON.stringify(next)], 'local.json'));
  sheet.foldThreshold = 3;
  sheet.variableBarWidth = true;
  sheet.selection = { kind: 'notes', indices: [0] };
  sheet.$dispose();
  const catalog = [
    { file: 'opening.json', title: initialScore.title, composer: initialScore.composer },
  ];
  const fetchScore = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog)));
  vi.stubGlobal('fetch', fetchScore);
  sheet = useScoreStore(createPinia());
  expect(await sheet.initialize()).toBe(true);
  expect(sheet.score).toEqual(next);
  expect(sheet.foldThreshold).toBe(3);
  expect(sheet.variableBarWidth).toBe(true);
  expect(sheet.selection).toEqual({ kind: 'notes', indices: [] });
  expect(sheet.catalog).toEqual(catalog);
  expect(fetchScore).toHaveBeenCalledExactlyOnceWith(
    `${import.meta.env.BASE_URL}scores/index.json`,
    { cache: 'no-cache' },
  );
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

test('hosted scores are saved by filename and fetched fresh after refresh', async () => {
  let sheet = useScoreStore(createPinia());
  const fetchScore = vi.fn().mockResolvedValue(new Response(JSON.stringify(next)));
  vi.stubGlobal('fetch', fetchScore);
  await sheet.loadHosted('piece.json');
  expect(fetchScore).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}scores/piece.json`, {
    cache: 'no-cache',
  });
  expect(sheet.score).toEqual(next);
  sheet.foldThreshold = 6;
  sheet.variableBarWidth = true;
  expect(JSON.parse(saved.get('music-sheet-state')!).opened).toEqual({ file: 'piece.json' });
  sheet.$dispose();
  const updated = { ...next, title: 'Updated piece' };
  fetchScore
    .mockReset()
    .mockResolvedValueOnce(
      new Response(JSON.stringify([{ file: 'opening.json' }, { file: 'piece.json' }])),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(updated)));
  sheet = useScoreStore(createPinia());
  expect(await sheet.initialize()).toBe(true);
  expect(sheet.score).toEqual(updated);
  expect(sheet.foldThreshold).toBe(6);
  expect(sheet.variableBarWidth).toBe(true);
  expect(fetchScore).toHaveBeenNthCalledWith(2, `${import.meta.env.BASE_URL}scores/piece.json`, {
    cache: 'no-cache',
  });
});

test('editing the displayed hosted score reloads its data while keeping layout settings', async () => {
  const sheet = useScoreStore(createPinia());
  const fetchScore = vi.fn().mockResolvedValue(new Response(JSON.stringify(next)));
  vi.stubGlobal('fetch', fetchScore);
  await sheet.loadHosted('piece.json');
  sheet.foldThreshold = 3;
  sheet.variableBarWidth = true;
  const updated = { ...next, annotations: [{ at: 0, text: 'Updated annotation' }] };
  fetchScore.mockReset().mockResolvedValue(new Response(JSON.stringify(updated)));
  expect(await sheet.refreshHosted('piece.json')).toBe(true);
  expect(sheet.score).toEqual(updated);
  expect(sheet.foldThreshold).toBe(3);
  expect(sheet.variableBarWidth).toBe(true);
  expect(fetchScore).toHaveBeenCalledExactlyOnceWith(
    `${import.meta.env.BASE_URL}scores/piece.json`,
    {
      cache: 'no-cache',
    },
  );
  expect(JSON.parse(saved.get('music-sheet-state')!).opened).toEqual({ file: 'piece.json' });
});

test('edits to other hosted scores leave the active score and uploaded files alone', async () => {
  const sheet = useScoreStore(createPinia());
  const fetchScore = vi.fn().mockResolvedValue(new Response(JSON.stringify(next)));
  vi.stubGlobal('fetch', fetchScore);
  await sheet.loadHosted('piece.json');
  fetchScore.mockClear();
  expect(await sheet.refreshHosted('another.json')).toBe(false);
  expect(fetchScore).not.toHaveBeenCalled();
  const uploaded = { ...next, title: 'Uploaded piece' };
  await sheet.loadFile(new File([JSON.stringify(uploaded)], 'piece.json'));
  expect(await sheet.refreshHosted('piece.json')).toBe(false);
  expect(fetchScore).not.toHaveBeenCalled();
  expect(sheet.score).toEqual(uploaded);
});

test('a failed hot update keeps the last valid score and a later edit can replace it', async () => {
  const sheet = useScoreStore(createPinia());
  const fetchScore = vi.fn().mockResolvedValue(new Response(JSON.stringify(next)));
  vi.stubGlobal('fetch', fetchScore);
  await sheet.loadHosted('piece.json');
  sheet.selection = { kind: 'notes', indices: [0] };
  fetchScore.mockResolvedValue(new Response('invalid JSON'));
  expect(await sheet.refreshHosted('piece.json')).toBe(false);
  expect(sheet.score).toEqual(next);
  expect(sheet.selection).toEqual({ kind: 'notes', indices: [0] });
  expect(sheet.error).not.toBe('');
  const updated = { ...next, title: 'Fixed piece' };
  fetchScore.mockResolvedValue(new Response(JSON.stringify(updated)));
  expect(await sheet.refreshHosted('piece.json')).toBe(true);
  expect(sheet.score).toEqual(updated);
  expect(sheet.error).toBe('');
});

test('a pending hot update cannot replace a score selected while it was loading', async () => {
  const sheet = useScoreStore(createPinia());
  const fetchScore = vi.fn().mockResolvedValue(new Response(JSON.stringify(next)));
  vi.stubGlobal('fetch', fetchScore);
  await sheet.loadHosted('piece.json');
  let finish!: (response: Response) => void;
  fetchScore.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const refresh = sheet.refreshHosted('piece.json');
  const uploaded = { ...next, title: 'Uploaded piece' };
  await sheet.loadFile(new File([JSON.stringify(uploaded)], 'local.json'));
  finish(new Response(JSON.stringify({ ...next, title: 'Old hot update' })));
  expect(await refresh).toBe(false);
  expect(sheet.score).toEqual(uploaded);
  expect(sheet.loading).toBe(false);
  expect(JSON.parse(saved.get('music-sheet-state')!).opened).toEqual({ score: uploaded });
});

test('the newest score edit wins when hot update responses arrive out of order', async () => {
  const sheet = useScoreStore(createPinia());
  const fetchScore = vi.fn().mockResolvedValue(new Response(JSON.stringify(next)));
  vi.stubGlobal('fetch', fetchScore);
  await sheet.loadHosted('piece.json');
  let finish!: (response: Response) => void;
  fetchScore.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const old = sheet.refreshHosted('piece.json');
  const updated = { ...next, title: 'Latest edit' };
  fetchScore.mockResolvedValueOnce(new Response(JSON.stringify(updated)));
  expect(await sheet.refreshHosted('piece.json')).toBe(true);
  finish(new Response(JSON.stringify({ ...next, title: 'Older edit' })));
  expect(await old).toBe(false);
  expect(sheet.score).toEqual(updated);
  expect(sheet.loading).toBe(false);
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
  expect(fetchScore).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}scores/index.json`, {
    cache: 'no-cache',
  });
  expect(sheet.score).toBeNull();
  expect(sheet.loading).toBe(true);
  ready(new Response(JSON.stringify(catalog)));
  expect(await loading).toBe(true);
  expect(fetchScore).toHaveBeenNthCalledWith(2, `${import.meta.env.BASE_URL}scores/opening.json`, {
    cache: 'no-cache',
  });
  expect(sheet.catalog).toEqual(catalog);
  expect(sheet.loading).toBe(false);
  expect(sheet.error).toBe('');
  expect(sheet.score).toEqual(initialScore);
  expect(sheet.totalTicks).toBe(1920);
  expect(sheet.bars[0]!.to).toBe(1920);
  expect(sheet.barCount).toBe(1);
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

test('a removed hosted score falls back to an available catalog entry after refresh', async () => {
  saved.set(
    'music-sheet-state',
    JSON.stringify({
      version: 2,
      opened: { file: 'removed.json' },
      foldThreshold: 6,
    }),
  );
  const catalog = [
    { file: 'opening.json', title: initialScore.title, composer: initialScore.composer },
  ];
  const fetchScore = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(catalog)))
    .mockResolvedValueOnce(new Response(JSON.stringify(initialScore)));
  vi.stubGlobal('fetch', fetchScore);
  const sheet = useScoreStore(createPinia());
  expect(await sheet.initialize()).toBe(true);
  expect(sheet.score).toEqual(initialScore);
  expect(sheet.foldThreshold).toBe(6);
  expect(fetchScore).toHaveBeenLastCalledWith(`${import.meta.env.BASE_URL}scores/opening.json`, {
    cache: 'no-cache',
  });
});

test('fetching the catalog preserves an already loaded score and its selection', async () => {
  const sheet = useScoreStore(createPinia());
  sheet.load(next);
  sheet.selection = { kind: 'notes', indices: [0] };
  const catalog = [
    { file: 'opening.json', title: initialScore.title, composer: initialScore.composer },
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

test('a saved score remains available when the catalog cannot be fetched after refresh', async () => {
  let sheet = useScoreStore(createPinia());
  sheet.load(next);
  sheet.$dispose();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
  sheet = useScoreStore(createPinia());
  expect(await sheet.initialize()).toBe(false);
  expect(sheet.score).toEqual(next);
  expect(sheet.error).toBe('Could not load score (404).');
});

test('invalid saved JSON or an invalid saved score falls back to the default score', async () => {
  for (const state of [
    'invalid JSON',
    JSON.stringify({ version: 2, opened: { score: { ppq: 0 } }, foldThreshold: 6 }),
  ]) {
    saved.set('music-sheet-state', state);
    const sheet = useScoreStore(createPinia());
    const fetchScore = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ file: 'opening.json' }])))
      .mockResolvedValueOnce(new Response(JSON.stringify(initialScore)));
    vi.stubGlobal('fetch', fetchScore);
    expect(await sheet.initialize()).toBe(true);
    expect(sheet.score).toEqual(initialScore);
    expect(sheet.error).toBe('');
    sheet.$dispose();
  }
});

test('old score caches are invalidated without losing the saved layout preferences', async () => {
  saved.set(
    'music-sheet-state',
    JSON.stringify({ score: next, foldThreshold: 6, variableBarWidth: true }),
  );
  const sheet = useScoreStore(createPinia());
  const fetchScore = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([{ file: 'opening.json' }])))
    .mockResolvedValueOnce(new Response(JSON.stringify(initialScore)));
  vi.stubGlobal('fetch', fetchScore);
  expect(await sheet.initialize()).toBe(true);
  expect(sheet.score).toEqual(initialScore);
  expect(sheet.foldThreshold).toBe(6);
  expect(sheet.variableBarWidth).toBe(true);
  expect(JSON.parse(saved.get('music-sheet-state')!)).toEqual({
    version: 2,
    opened: { file: 'opening.json' },
    foldThreshold: 6,
    variableBarWidth: true,
  });
});

test('unavailable storage does not prevent score loading or layout changes', async () => {
  vi.stubGlobal('localStorage', {
    getItem() {
      throw new DOMException('Storage blocked', 'SecurityError');
    },
    setItem() {
      throw new DOMException('Storage blocked', 'SecurityError');
    },
  });
  const sheet = useScoreStore(createPinia());
  expect(await sheet.loadFile(new File([JSON.stringify(next)], 'local.json'))).toBe(true);
  sheet.foldThreshold = 0;
  sheet.variableBarWidth = true;
  expect(sheet.score).toEqual(next);
  expect(sheet.foldThreshold).toBe(0);
  expect(sheet.variableBarWidth).toBe(true);
  expect(sheet.error).toBe('');
});
