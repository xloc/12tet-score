import { computed, ref, watch } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { scoreDuration, type Score, type ScoreEntry } from '../music.ts';
import { performedNotes } from '../ornaments';
import { scoreBars, validateTempos } from '../timing';
import { selectedIndices, selectionSpan, type MusicSelection } from '../selection.ts';

type OpenedScore = { file: string } | { score: Score };
const savedScoreVersion = 2;

export const useScoreStore = defineStore('score', () => {
  let saved: {
    version?: number;
    opened?: OpenedScore | null;
    foldThreshold?: number;
    variableBarWidth?: boolean;
  } = {};
  try {
    saved = JSON.parse(globalThis.localStorage?.getItem('music-sheet-state') ?? '{}') ?? {};
  } catch {
    // Unavailable storage or invalid saved JSON leaves the defaults in place.
  }
  const score = ref<Score | null>(null);
  const opened = ref<OpenedScore | null>(null);
  const catalog = ref<ScoreEntry[]>([]);
  const loading = ref(false);
  const error = ref('');
  const totalTicks = computed(() => (score.value ? scoreDuration(score.value) : 0));
  const bars = computed(() =>
    score.value
      ? scoreBars(
          totalTicks.value,
          score.value.ppq,
          score.value.meters,
          score.value.sections,
          score.value.pickup,
        )
      : [],
  );
  const barCount = computed(() => bars.value.filter((bar) => bar.number > 0).length);
  const foldThreshold = ref(saved.foldThreshold ?? 12);
  const variableBarWidth = ref(saved.variableBarWidth ?? false);
  const selection = ref<MusicSelection>({ kind: 'notes', indices: [] });
  const notes = computed(() => (score.value ? performedNotes(score.value) : []));
  const selectedNotes = computed(() => {
    const selected = selectedIndices(notes.value, selection.value).map(
      (index) => notes.value[index]!,
    );
    const owners = new Set(selected.filter((note) => !note.grace).map((note) => note.source));
    return notes.value.filter(
      (note) => selected.includes(note) || (note.grace && owners.has(note.source)),
    );
  });
  const span = computed(() =>
    selection.value.kind === 'range'
      ? { from: selection.value.from, to: selection.value.to }
      : selectionSpan(selectedNotes.value, {
          kind: 'notes',
          indices: selectedNotes.value.map((_, index) => index),
        }),
  );
  let request = 0;

  watch(
    [opened, foldThreshold, variableBarWidth],
    () => {
      try {
        globalThis.localStorage?.setItem(
          'music-sheet-state',
          JSON.stringify({
            version: savedScoreVersion,
            opened: opened.value,
            foldThreshold: foldThreshold.value,
            variableBarWidth: variableBarWidth.value,
          }),
        );
      } catch {
        // Storage may be disabled or full; the current sheet remains usable.
      }
    },
    { flush: 'sync' },
  );

  function load(next: Score, file?: string) {
    if (!Number.isFinite(next.ppq) || next.ppq <= 0) throw new Error('PPQ must be positive.');
    validateTempos(next.tempos);
    scoreBars(scoreDuration(next), next.ppq, next.meters, next.sections, next.pickup);
    performedNotes(next);
    selection.value = { kind: 'notes', indices: [] };
    score.value = next;
    opened.value = file ? { file } : { score: next };
  }

  async function readScore(read: (current: () => boolean) => Promise<void>) {
    const id = ++request;
    const current = () => id === request;
    loading.value = true;
    error.value = '';
    try {
      await read(current);
      return current();
    } catch (cause) {
      if (current()) error.value = cause instanceof Error ? cause.message : String(cause);
      return false;
    } finally {
      if (current()) loading.value = false;
    }
  }

  function loadFile(file: File) {
    return readScore(async (current) => {
      if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
        throw new Error('Choose a JSON score file.');
      }
      const next = JSON.parse(await file.text());
      if (current()) load(next);
    });
  }

  async function readJSON<T>(file: string): Promise<T> {
    const response = await fetch(`${import.meta.env.BASE_URL}scores/${file}`, {
      cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`Could not load score (${response.status}).`);
    return response.json();
  }

  function loadHosted(file: string) {
    return readScore(async (current) => {
      const next = await readJSON<Score>(file);
      if (current()) load(next, file);
    });
  }

  async function refreshHosted(file: string) {
    if (!opened.value || !('file' in opened.value) || opened.value.file !== file) return false;
    return readScore(async (current) => {
      const next = await readJSON<Score>(file);
      if (current() && opened.value && 'file' in opened.value && opened.value.file === file)
        load(next, file);
    });
  }

  function initialize() {
    return readScore(async (current) => {
      if (
        !score.value &&
        saved.version === savedScoreVersion &&
        saved.opened &&
        'score' in saved.opened
      ) {
        try {
          load(saved.opened.score);
        } catch {
          // A saved score that no longer loads falls back to the public catalog.
        }
      }
      const entries = await readJSON<ScoreEntry[]>('index.json');
      if (!current()) return;
      catalog.value = entries;
      if (!score.value) {
        const savedFile =
          saved.version === savedScoreVersion && saved.opened && 'file' in saved.opened
            ? saved.opened.file
            : undefined;
        const file = entries.find((entry) => entry.file === savedFile)?.file ?? entries[0]?.file;
        if (file) {
          const next = await readJSON<Score>(file);
          if (current()) load(next, file);
        }
      }
    });
  }

  return {
    score,
    notes,
    catalog,
    loading,
    error,
    totalTicks,
    bars,
    barCount,
    foldThreshold,
    variableBarWidth,
    selection,
    selectedNotes,
    span,
    load,
    loadFile,
    loadHosted,
    refreshHosted,
    initialize,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useScoreStore, import.meta.hot));
}
