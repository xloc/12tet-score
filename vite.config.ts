import { readFileSync, readdirSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vite-plus';
import type { Score, ScoreEntry } from './src/music';

function scoreCatalog() {
  const directory = new URL('./public/scores/', import.meta.url);
  const entries: ScoreEntry[] = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort()
    .map((file) => {
      const { title, composer }: Score = JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
      return { file, title, composer };
    });
  return JSON.stringify(entries, null, 2);
}

const scoreCatalogPlugin: Plugin = {
  name: 'score-catalog',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] !== `${server.config.base}scores/index.json`) return next();
      response.setHeader('Content-Type', 'application/json');
      response.end(scoreCatalog());
    });
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'scores/index.json', source: scoreCatalog() });
  },
};

export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss(), scoreCatalogPlugin],
  test: {
    include: ['src/**/*.test.ts'],
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
