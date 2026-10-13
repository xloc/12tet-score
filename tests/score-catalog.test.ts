import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vite-plus/test';
import { createServer } from 'vite-plus';
import { scoreCatalogPlugin } from '../vite.config.ts';

test('saving a score JSON sends a targeted HMR event without reloading the page', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'music-sheet-hmr-')));
  const directory = join(root, 'public', 'scores');
  const file = join(directory, '淑女最后的答案.json');
  await mkdir(directory, { recursive: true });
  await writeFile(file, JSON.stringify({ title: 'Original piece', composer: 'Composer' }));
  const httpServer = createHttpServer();
  const server = await createServer({
    configFile: false,
    root,
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
    await vi.waitFor(() =>
      expect(server.watcher.getWatched()[directory]).toContain('淑女最后的答案.json'),
    );
    await writeFile(file, JSON.stringify({ title: 'Updated piece', composer: 'Composer' }));
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        type: 'custom',
        event: 'score-updated',
        data: { file: '淑女最后的答案.json' },
      }),
    );
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'full-reload' }));
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
