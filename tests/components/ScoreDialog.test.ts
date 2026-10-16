import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia } from 'pinia';
import type { Pinia } from 'pinia';
import ScoreDialog from '../../src/components/ScoreDialog.vue';
import { builtinSource, catalogScoreUrl } from '../../src/library';
import { useLibraryStore } from '../../src/stores/library';
import { useScoreStore } from '../../src/stores/score';
import { createScore } from '../helpers/score';
import { createCatalog, mockLibraryStorage } from '../helpers/library';

beforeEach(() => mockLibraryStorage());
afterEach(() => vi.unstubAllGlobals());

async function render(pinia: Pinia) {
  return renderToString(createSSRApp(ScoreDialog).use(pinia));
}

test('sidebar resizing keeps the dialog width fixed, respects limits, and releases pointer capture', async () => {
  const dialog = { clientWidth: 1000 };
  const captured = new Set<number>();
  const target = {
    focus: vi.fn(),
    setPointerCapture: (id: number) => captured.add(id),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => captured.delete(id),
  };
  let actions!: {
    sidebarWidth: number;
    sidebarResize: unknown;
    startSidebarResize: (event: PointerEvent) => void;
    moveSidebarResize: (event: PointerEvent) => void;
    stopSidebarResize: (event?: PointerEvent) => void;
  };
  const app = createSSRApp(ScoreDialog).use(createPinia());
  app.mixin({
    created() {
      if (!this.$parent) {
        actions = this.$.setupState as typeof actions;
        this.$.refs.dialog = dialog;
        this.$.refs.sidebar = {
          getBoundingClientRect: () => ({
            width: Math.min(actions.sidebarWidth, dialog.clientWidth / 2),
          }),
        };
      }
    },
  });
  await renderToString(app);
  function event(clientX: number, overrides: Partial<PointerEvent> = {}) {
    return {
      clientX,
      pointerId: 1,
      button: 0,
      isPrimary: true,
      currentTarget: target,
      preventDefault: () => {},
      ...overrides,
    } as unknown as PointerEvent;
  }
  actions.startSidebarResize(event(300, { button: 2 }));
  expect(captured.size).toBe(0);
  actions.startSidebarResize(event(300));
  expect(captured.has(1)).toBe(true);
  actions.moveSidebarResize(event(400));
  expect(actions.sidebarWidth).toBe(308);
  expect(dialog.clientWidth).toBe(1000);
  actions.moveSidebarResize(event(900, { pointerId: 2 }));
  actions.stopSidebarResize(event(900, { pointerId: 2 }));
  expect(actions.sidebarWidth).toBe(308);
  expect(captured.has(1)).toBe(true);
  actions.moveSidebarResize(event(-1000));
  expect(actions.sidebarWidth).toBe(176);
  actions.moveSidebarResize(event(2000));
  expect(actions.sidebarWidth).toBe(500);
  actions.stopSidebarResize(event(2000));
  expect(captured.size).toBe(0);
  expect(actions.sidebarResize).toBeNull();
  actions.moveSidebarResize(event(400));
  expect(actions.sidebarWidth).toBe(500);

  // After the viewport narrows, dragging starts from the sidebar's rendered width.
  dialog.clientWidth = 640;
  actions.startSidebarResize(event(500));
  actions.moveSidebarResize(event(484));
  expect(actions.sidebarWidth).toBe(304);
  actions.stopSidebarResize();
  expect(captured.size).toBe(0);
  expect(dialog.clientWidth).toBe(640);
});

test('sources are directly selectable and the add-site form stays hidden until requested', async () => {
  const pinia = createPinia();
  const library = useLibraryStore(pinia);
  library.sites.push({
    id: 'site',
    kind: 'catalog',
    name: 'External library',
    url: 'https://site.example/index.json',
  });
  library.listings.builtin = {
    loaded: true,
    loading: false,
    error: '',
    entries: [
      { id: 'first', title: 'First piece', composer: 'First composer', url: './first.json' },
      { id: 'second', title: 'Second piece', composer: 'Second composer', url: './second.json' },
    ],
  };
  const html = await render(pinia);
  expect(html).toContain('Examples');
  expect(html).toContain('My scores');
  expect(html).toContain('External library');
  for (const name of ['Examples', 'My scores', 'External library']) {
    expect(html).toMatch(new RegExp(`<button\\b[^>]*title="${name}"`));
  }
  expect(html).not.toContain('<select');
  expect(html).toContain('First piece');
  expect(html).toContain('Second composer');
  expect(html.match(/<li\b/g)).toHaveLength(2);
  expect(html).toContain('title="Add site"');
  expect(html).not.toContain('Catalog URL');
  expect(html).not.toContain('type="url"');
  expect(html).not.toContain('Remove site');
  expect(html).not.toContain('Show score info');
});

test('the local source shows all imported scores with multiple-file import and individual removal', async () => {
  const pinia = createPinia();
  const library = useLibraryStore(pinia);
  const refs = await library.importFiles([
    new File([JSON.stringify(createScore({ title: 'One' }))], 'one.json'),
    new File([JSON.stringify(createScore({ title: 'Two' }))], 'two.json'),
  ]);
  await useScoreStore(pinia).open(refs[0]!);
  const html = await render(pinia);
  expect(html).toContain('One');
  expect(html).toContain('Two');
  expect(html).toContain('Import scores');
  expect(html).toMatch(/<input\b[^>]*type="file"[^>]*multiple/);
  expect(html).toContain('accept=".json,application/json"');
  expect(html.match(/title="Remove /g)).toHaveLength(2);
  expect(html).not.toContain('Remove site');
});

test('per-source errors retain the previous entries and an active site can be removed', async () => {
  const pinia = createPinia();
  const library = useLibraryStore(pinia);
  const sheet = useScoreStore(pinia);
  library.sites.push({
    id: 'site',
    kind: 'catalog',
    name: 'Site',
    url: 'https://site.example/index.json',
  });
  library.listings.site = {
    loaded: true,
    loading: false,
    error: 'Site unavailable',
    entries: [
      { id: 'piece', title: 'Previous listing', composer: 'Composer', url: './piece.json' },
    ],
  };
  sheet.opened = { sourceId: 'site', scoreId: 'piece' };
  const html = await render(pinia);
  expect(html).toContain('Previous listing');
  expect(html).toContain('Site unavailable');
  expect(html).toContain('Remove site');
  expect(html).not.toContain('No scores available.');
});

test('pending listings and empty catalogs have distinct messages and opening another score remains available', async () => {
  const pinia = createPinia();
  const library = useLibraryStore(pinia);
  const sheet = useScoreStore(pinia);
  expect(await render(pinia)).toContain('No scores available.');
  library.listings.builtin = { loaded: false, loading: true, error: '', entries: [] };
  const pending = await render(pinia);
  expect(pending).toContain('Loading scores…');
  expect(pending).not.toContain('No scores available.');
  library.listings.builtin.loaded = true;
  library.listings.builtin.loading = false;
  library.listings.builtin.entries = [
    { id: 'piece', title: 'Piece', composer: '', url: './piece.json' },
  ];
  sheet.loading = true;
  const opening = await render(pinia);
  expect(opening).toContain('Loading score…');
  const entryButton = opening.match(/<li\b[^>]*>[\s\S]*?<button\b[^>]*>/)![0];
  expect(entryButton).not.toContain('disabled');
  expect(opening).toContain('title="Examples"');
  expect(opening).toContain('title="Add site"');
});

test.each([
  builtinSource,
  { id: 'site', kind: 'catalog' as const, name: 'Site', url: 'https://site.example/index.json' },
])(
  'switching scores keeps the $id catalog cached and its list pane unchanged during the score request',
  async (source) => {
    const pinia = createPinia();
    const library = useLibraryStore(pinia);
    const sheet = useScoreStore(pinia);
    if (source.id !== builtinSource.id) library.sites.push(source);
    const entries = [
      { id: 'first', title: 'First piece', composer: 'Composer', url: './first.json' },
      { id: 'second', title: 'Second piece', composer: 'Composer', url: './second.json' },
    ];
    const firstUrl = catalogScoreUrl(source.url, entries[0]!.url);
    const secondUrl = catalogScoreUrl(source.url, entries[1]!.url);
    let finish!: (response: Response) => void;
    const fetchJSON = vi.fn(async (url: string) => {
      if (url === source.url) return new Response(JSON.stringify(createCatalog(entries)));
      if (url === firstUrl)
        return new Response(JSON.stringify(createScore({ title: 'First piece' })));
      if (url === secondUrl)
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchJSON);
    await library.list(source.id);
    const listing = library.listings[source.id]!;
    const cached = listing.entries;
    await sheet.open({ sourceId: source.id, scoreId: 'first' });
    let actions!: { open: (scoreId: string) => Promise<void> };
    const app = createSSRApp(ScoreDialog).use(pinia);
    app.mixin({
      created() {
        if (!this.$parent) actions = this.$.setupState as typeof actions;
      },
    });
    const before = await renderToString(app);
    const opening = actions.open('second');
    await Promise.resolve();
    expect(sheet.loading).toBe(true);
    expect(sheet.score?.title).toBe('First piece');
    expect(listing.loading).toBe(false);
    expect(listing.entries).toBe(cached);
    const pending = await render(pinia);
    finish(new Response(JSON.stringify(createScore({ title: 'Second piece' }))));
    await opening;
    expect(sheet.score?.title).toBe('Second piece');
    expect(listing.entries).toBe(cached);
    expect(fetchJSON.mock.calls.map(([url]) => url)).toEqual([source.url, firstUrl, secondUrl]);
    const listPane = (html: string) => html.slice(html.indexOf('</aside>') + '</aside>'.length);
    expect(listPane(pending).replace('Loading score…', '')).toBe(listPane(before));
    const countLine = pending
      .match(/<p\b[^>]*>[\s\S]*?<\/p>/g)!
      .find((line) => /2\s+scores/.test(line));
    expect(countLine).toContain('Loading score…');
    const info = pending.match(/<aside\b[^>]*>[\s\S]*?<\/aside>/)![0];
    expect(info).not.toContain('Loading score…');
    expect(info).toContain('Current score');
    expect(info).toContain('First piece');
  },
);

test('current score information is always visible beneath the source navigation', async () => {
  const pinia = createPinia();
  const score = createScore({
    title: 'Current piece',
    composer: 'Composer',
    collection: 'Collection',
    source: {
      name: 'Edition',
      url: 'https://example.org/edition',
      scoreUrl: '',
      license: 'Public Domain',
      reference: '',
    },
  });
  useScoreStore(pinia).load(score);
  const html = await render(pinia);
  const info = html.match(/<aside\b[^>]*>[\s\S]*?<\/aside>/)![0];
  expect(html.match(/<dialog\b/g)).toHaveLength(1);
  expect(html).not.toContain('Show score info');
  expect(html).not.toContain('<details');
  expect(html).toMatch(/<\/nav>\s*<aside\b/);
  expect(html).toContain('Change score');
  expect(html).toContain('title="Examples"');
  expect(info).toContain('Current score');
  expect(info).toContain(score.title);
  expect(info).toContain(score.composer);
  expect(info).toContain(score.collection);
  expect(info).toContain(score.source.url);
  expect(info).toContain(score.source.license);
});

test('selecting imported scores updates the current score without closing the dialog', async () => {
  const pinia = createPinia();
  const dialog = {
    open: true,
    close: vi.fn(() => {
      dialog.open = false;
    }),
  };
  let actions!: {
    sourceId: string;
    selectFiles: (files: File[]) => Promise<void>;
    open: (scoreId: string) => Promise<void>;
  };
  const app = createSSRApp(ScoreDialog).use(pinia);
  app.mixin({
    created() {
      if (!this.$parent) {
        actions = this.$.setupState as typeof actions;
        this.$.refs.dialog = dialog;
      }
    },
  });
  await renderToString(app);
  await actions.selectFiles([
    new File([JSON.stringify(createScore({ title: 'One' }))], 'one.json'),
    new File([JSON.stringify(createScore({ title: 'Two' }))], 'two.json'),
  ]);
  const library = useLibraryStore(pinia);
  const sheet = useScoreStore(pinia);
  expect(actions.sourceId).toBe('local');
  expect(sheet.score).toBeNull();
  const entries = await library.list('local');
  expect(entries).toHaveLength(2);
  await actions.open(entries[1]!.id);
  expect(sheet.score?.title).toBe('Two');
  expect(sheet.opened).toEqual({ sourceId: 'local', scoreId: entries[1]!.id });
  let info = (await render(pinia)).match(/<aside\b[^>]*>[\s\S]*?<\/aside>/)![0];
  expect(info).toContain('Two');
  await actions.open(entries[0]!.id);
  expect(sheet.score?.title).toBe('One');
  info = (await render(pinia)).match(/<aside\b[^>]*>[\s\S]*?<\/aside>/)![0];
  expect(info).toContain('One');
  expect(info).not.toContain('Two');
  await actions.open('missing');
  expect(sheet.error).not.toBe('');
  expect(sheet.score?.title).toBe('One');
  const failed = await render(pinia);
  expect(failed.match(/<aside\b[^>]*>[\s\S]*?<\/aside>/)![0]).toContain(sheet.error);
  expect(failed.slice(failed.indexOf('</aside>') + '</aside>'.length)).not.toContain(sheet.error);
  expect(dialog.close).not.toHaveBeenCalled();
  expect(dialog.open).toBe(true);
  expect(await library.list('local')).toHaveLength(2);
});

test('the add-site form selects its new source and reports registration failures', async () => {
  const pinia = createPinia();
  useScoreStore(pinia).load(createScore({ title: 'Current piece' }));
  let actions!: {
    sourceId: string;
    catalogUrl: string;
    showSiteForm: boolean;
    showAddSite: () => Promise<void>;
    selectSource: (id: string) => void;
    addSite: () => Promise<void>;
  };
  const app = createSSRApp(ScoreDialog).use(pinia);
  app.mixin({
    created() {
      if (!this.$parent) {
        actions = this.$.setupState as typeof actions;
        void actions.showAddSite();
      }
    },
  });
  const html = await renderToString(app);
  expect(html).toContain('Catalog URL');
  expect(html).toContain('type="url"');
  expect(html).toContain('Cancel');
  expect(html.match(/<aside\b[^>]*>[\s\S]*?<\/aside>/)![0]).toContain('Current piece');
  expect(actions.showSiteForm).toBe(true);
  actions.selectSource('local');
  expect(actions.sourceId).toBe('local');
  expect(actions.showSiteForm).toBe(false);
  await actions.showAddSite();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(createCatalog([], 'New site')))),
  );
  actions.catalogUrl = 'https://site.example/index.json';
  await actions.addSite();
  const library = useLibraryStore(pinia);
  expect(library.sites).toHaveLength(1);
  expect(actions.sourceId).toBe(library.sites[0]!.id);
  expect(actions.catalogUrl).toBe('');
  expect(actions.showSiteForm).toBe(false);
  await actions.showAddSite();
  actions.catalogUrl = 'file:///index.json';
  await actions.addSite();
  expect(library.sites).toHaveLength(1);
  expect(actions.catalogUrl).toBe('file:///index.json');
  expect(library.siteError).toContain('HTTP or HTTPS');
  expect(actions.showSiteForm).toBe(true);
});
