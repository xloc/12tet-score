import type { Score } from './music';

export type LibrarySource = { id: string; name: string } & (
  | { kind: 'local' }
  | { kind: 'catalog'; url: string }
);
export type CatalogSource = Extract<LibrarySource, { kind: 'catalog' }>;
export type ScoreRef = { sourceId: string; scoreId: string };
// Only catalog entries have a URL. Local entries are read by ID.
export type ScoreEntry = Pick<Score, 'title' | 'composer'> & { id: string; url?: string };
export type ScoreCatalog = {
  version: 1;
  name: string;
  scores: (ScoreEntry & { url: string })[];
};
export type SourceListing = {
  entries: ScoreEntry[];
  loaded: boolean;
  loading: boolean;
  error: string;
};

export const builtinSource: CatalogSource = {
  id: 'builtin',
  kind: 'catalog',
  name: 'Examples',
  url: `${import.meta.env.BASE_URL}scores/index.json`,
};
export const localSource: LibrarySource = { id: 'local', kind: 'local', name: 'My scores' };

export function catalogScoreUrl(catalogUrl: string, scoreUrl: string) {
  return new URL(scoreUrl, new URL(catalogUrl, globalThis.location?.href ?? 'http://localhost/'))
    .href;
}

export async function readJSON<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-cache', credentials: 'omit' });
  if (!response.ok) throw new Error(`Could not load JSON (${response.status}).`);
  return response.json();
}

export async function readCatalog(url: string) {
  const catalog = await readJSON<ScoreCatalog>(url);
  if (catalog.version !== 1 || typeof catalog.name !== 'string' || !Array.isArray(catalog.scores)) {
    throw new Error('Expected a version 1 score catalog with a name and scores.');
  }
  const ids = new Set<string>();
  for (const entry of catalog.scores) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      !entry.id ||
      typeof entry.title !== 'string' ||
      typeof entry.composer !== 'string' ||
      typeof entry.url !== 'string' ||
      !entry.url
    )
      throw new Error('Catalog scores need an id, title, composer, and URL.');
    if (ids.has(entry.id)) throw new Error(`Duplicate score ID: ${entry.id}.`);
    ids.add(entry.id);
    const resolved = new URL(catalogScoreUrl(url, entry.url));
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
      throw new Error('Score URLs must use HTTP or HTTPS.');
    }
  }
  return catalog;
}
