import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vite-plus/test';
import { createServer } from 'vite-plus';
import { scoreCatalogPlugin } from '../vite.config.ts';

test('the dev server publishes a versioned catalog and readable score URLs under its base path', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'music-sheet-catalog-')));
  const publicDir = join(root, 'fixtures');
  const directory = join(publicDir, 'scores');
  const score = { title: 'Example piece', composer: 'Example composer' };
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'piece.json'), JSON.stringify(score));
  const server = await createServer({
    configFile: false,
    root,
    publicDir,
    base: '/music/',
    cacheDir: join(root, '.vite'),
    plugins: [scoreCatalogPlugin()],
    server: { host: '127.0.0.1', port: 0 },
  });
  try {
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('Expected an HTTP port.');
    const url = `http://127.0.0.1:${address.port}/music/scores/index.json`;
    const response = await fetch(url);
    expect(response.headers.get('cache-control')).toBe('no-cache');
    const catalog = await response.json();
    expect(catalog).toEqual({
      version: 1,
      name: 'Examples',
      scores: [{ id: 'piece', url: './piece.json', ...score }],
    });
    const piece = await fetch(new URL(catalog.scores[0].url, url));
    expect(await piece.json()).toEqual(score);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('saving a score JSON sends a targeted HMR event without reloading the page', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'music-sheet-hmr-')));
  const publicDir = join(root, 'fixtures');
  const directory = join(publicDir, 'scores');
  const file = join(directory, 'piece.json');
  await mkdir(directory, { recursive: true });
  await writeFile(file, JSON.stringify({ title: 'Original piece', composer: 'Composer' }));
  const httpServer = createHttpServer();
  const server = await createServer({
    configFile: false,
    root,
    publicDir,
    cacheDir: join(root, '.vite'),
    plugins: [scoreCatalogPlugin()],
    appType: 'custom',
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
      watch: { usePolling: true, interval: 10 },
    },
  });
  try {
    const send = vi.spyOn(server.environments.client!.hot, 'send');
    await vi.waitFor(() => expect(server.watcher.getWatched()[directory]).toContain('piece.json'));
    await writeFile(file, JSON.stringify({ title: 'Updated piece', composer: 'Composer' }));
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        type: 'custom',
        event: 'score-updated',
        data: { scoreId: 'piece' },
      }),
    );
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'full-reload' }));
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
