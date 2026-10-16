import { computed, reactive, ref, watch } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import {
  builtinSource,
  localSource,
  catalogScoreUrl,
  readCatalog,
  readJSON,
  type CatalogSource,
  type ScoreEntry,
  type ScoreRef,
  type SourceListing,
} from '../library';
import {
  deleteLocalScore,
  listLocalScores,
  readLocalScore,
  saveLocalScores,
  type LocalScore,
} from '../local-scores';
import type { Score } from '../music';
import { performedNotes } from '../ornaments';
import { validateScore } from '../timing';

export const useLibraryStore = defineStore('library', () => {
  let saved: CatalogSource[] = [];
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem('music-sheet-sites') ?? '[]');
    if (Array.isArray(value)) saved = value;
  } catch {
    // Unavailable storage or invalid JSON leaves the built-in sources available.
  }
  const sites = ref<CatalogSource[]>(saved);
  const sources = computed(() => [builtinSource, localSource, ...sites.value]);
  const listings = reactive<Record<string, SourceListing>>({});
  const importing = ref(false);
  const importError = ref('');
  const addingSite = ref(false);
  const siteError = ref('');
  const requests = new Map<string, Promise<ScoreEntry[]>>();

  watch(
    sites,
    () => {
      try {
        globalThis.localStorage?.setItem('music-sheet-sites', JSON.stringify(sites.value));
      } catch {
        // The current source registry remains usable when preferences cannot be saved.
      }
    },
    { deep: true, flush: 'sync' },
  );

  function source(id: string) {
    const value = sources.value.find((item) => item.id === id);
    if (!value) throw new Error('This score source has been removed.');
    return value;
  }

  function listing(id: string) {
    if (!listings[id]) listings[id] = { entries: [], loaded: false, loading: false, error: '' };
    return listings[id]!;
  }

  function refresh(sourceId: string): Promise<ScoreEntry[]> {
    const pending = requests.get(sourceId);
    if (pending) return pending;
    const selected = source(sourceId);
    const state = listing(sourceId);
    state.loading = true;
    state.error = '';
    const request = (async () => {
      try {
        let entries: ScoreEntry[];
        if (selected.kind === 'local') {
          entries = (await listLocalScores()).map(({ id, score }) => ({
            id,
            title: score.title,
            composer: score.composer,
          }));
        } else {
          const catalog = await readCatalog(selected.url);
          entries = catalog.scores;
          if (selected.id !== builtinSource.id) selected.name = catalog.name;
        }
        source(sourceId);
        state.entries = entries;
        state.loaded = true;
        return entries;
      } catch (cause) {
        state.error = cause instanceof Error ? cause.message : String(cause);
        throw cause;
      } finally {
        state.loading = false;
        requests.delete(sourceId);
      }
    })();
    requests.set(sourceId, request);
    return request;
  }

  function list(sourceId: string) {
    source(sourceId);
    const state = listing(sourceId);
    return state.loaded ? Promise.resolve(state.entries) : refresh(sourceId);
  }

  async function read(ref: ScoreRef): Promise<Score> {
    const entries = await list(ref.sourceId);
    const selected = source(ref.sourceId);
    const entry = entries.find((item) => item.id === ref.scoreId);
    if (!entry) throw new Error('This score is no longer in the source catalog.');
    const score = await (selected.kind === 'local'
      ? readLocalScore(ref.scoreId)
      : readJSON<Score>(catalogScoreUrl(selected.url, entry.url!)));
    source(ref.sourceId);
    return score;
  }

  async function importFiles(files: File[]): Promise<ScoreRef[]> {
    importing.value = true;
    importError.value = '';
    const entries: LocalScore[] = [];
    const errors: string[] = [];
    try {
      const state = listing(localSource.id);
      await list(localSource.id);
      for (const file of files) {
        try {
          if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
            throw new Error('Choose a JSON score file.');
          }
          const score: Score = JSON.parse(await file.text());
          validateScore(score);
          performedNotes(score);
          entries.push({ id: crypto.randomUUID(), score });
        } catch (cause) {
          errors.push(`${file.name}: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
      }
      await saveLocalScores(entries);
      state.entries.push(
        ...entries.map(({ id, score }) => ({ id, title: score.title, composer: score.composer })),
      );
      importError.value = errors.join('\n');
      return entries.map(({ id }) => ({ sourceId: localSource.id, scoreId: id }));
    } catch (cause) {
      importError.value = cause instanceof Error ? cause.message : String(cause);
      return [];
    } finally {
      importing.value = false;
    }
  }

  async function removeLocal(scoreId: string) {
    const state = listing(localSource.id);
    state.error = '';
    try {
      await deleteLocalScore(scoreId);
      state.entries = state.entries.filter((entry) => entry.id !== scoreId);
    } catch (cause) {
      state.error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async function addSite(catalogUrl: string) {
    addingSite.value = true;
    siteError.value = '';
    try {
      const url = new URL(catalogUrl.trim());
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Catalog URLs must use HTTP or HTTPS.');
      }
      url.hash = '';
      const existing = sites.value.find((item) => item.url === url.href);
      if (existing) return existing;
      const catalog = await readCatalog(url.href);
      const added: CatalogSource = {
        id: crypto.randomUUID(),
        kind: 'catalog',
        name: catalog.name,
        url: url.href,
      };
      sites.value.push(added);
      listings[added.id] = { entries: catalog.scores, loaded: true, loading: false, error: '' };
      return added;
    } catch (cause) {
      siteError.value = cause instanceof Error ? cause.message : String(cause);
      return null;
    } finally {
      addingSite.value = false;
    }
  }

  function removeSite(sourceId: string) {
    if (!sites.value.some((item) => item.id === sourceId)) return;
    sites.value = sites.value.filter((item) => item.id !== sourceId);
    delete listings[sourceId];
  }

  return {
    sources,
    sites,
    listings,
    importing,
    importError,
    addingSite,
    siteError,
    list,
    read,
    refresh,
    importFiles,
    removeLocal,
    addSite,
    removeSite,
  };
});

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useLibraryStore, import.meta.hot));
