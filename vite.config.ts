import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vite-plus';
import type { Score } from './src/music';
import type { ScoreCatalog } from './src/library';

function scoreCatalog(directory: string) {
  const entries: ScoreCatalog['scores'] = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort()
    .map((file) => {
      const { title, composer }: Score = JSON.parse(readFileSync(join(directory, file), 'utf8'));
      return { id: basename(file, '.json'), url: `./${file}`, title, composer };
    });
  const catalog: ScoreCatalog = { version: 1, name: 'Examples', scores: entries };
  return JSON.stringify(catalog, null, 2);
}

export function scoreCatalogPlugin(): Plugin {
  let directory = '';
  return {
    name: 'score-catalog',
    configResolved(config) {
      directory = join(config.publicDir, 'scores');
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== `${server.config.base}scores/index.json`) return next();
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-cache');
        response.end(scoreCatalog(directory));
      });
    },
    hotUpdate({ file }) {
      if (
        this.environment.name !== 'client' ||
        dirname(file) !== directory ||
        !file.endsWith('.json')
      )
        return;
      this.environment.hot.send({
        type: 'custom',
        event: 'score-updated',
        data: { scoreId: basename(file, '.json') },
      });
      return [];
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'scores/index.json',
        source: scoreCatalog(directory),
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss(), scoreCatalogPlugin()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    singleQuote: true,
    ignorePatterns: ['AGENTS.md', 'CLAUDE.md', 'music_notation_chat.md', 'design/**'],
  },
});
