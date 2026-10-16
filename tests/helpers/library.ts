import { IDBFactory } from 'fake-indexeddb';
import { vi } from 'vite-plus/test';
import type { ScoreCatalog } from '../../src/library';

export function mockLibraryStorage() {
  const saved = new Map<string, string>();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('location', new URL('https://app.example/music/'));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
  return saved;
}

export function createCatalog(
  scores: ScoreCatalog['scores'] = [],
  name = 'Examples',
): ScoreCatalog {
  return { version: 1, name, scores };
}
