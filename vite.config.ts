import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
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
