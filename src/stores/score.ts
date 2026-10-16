import { computed, ref, watch } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { scoreDuration, type Score } from '../music.ts';
import { performedNotes } from '../ornaments';
import { builtinSource, type ScoreRef } from '../library';
import { scoreBars, validateScore } from '../timing';
import { selectedIndices, selectionSpan, type MusicSelection } from '../selection.ts';
import { useLibraryStore } from './library';

const savedScoreVersion = 3;

export const useScoreStore = defineStore('score', () => {
  const library = useLibraryStore();
  let saved: {
    version?: number;
    opened?: ScoreRef | null;
    foldThreshold?: number;
    variableBarWidth?: boolean;
  } = {};
  try {
    saved = JSON.parse(globalThis.localStorage?.getItem('music-sheet-state') ?? '{}') ?? {};
  } catch {
    // Unavailable storage or invalid saved JSON leaves the defaults in place.
  }
  const score = ref<Score | null>(null);
  const opened = ref<ScoreRef | null>(null);
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

  function commit(next: Score, ref: ScoreRef | null) {
    validateScore(next);
    performedNotes(next);
    selection.value = { kind: 'notes', indices: [] };
    score.value = next;
    opened.value = ref;
  }

  function load(next: Score) {
    commit(next, null);
    request++;
    loading.value = false;
    error.value = '';
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

  function open(ref: ScoreRef) {
    return readScore(async (current) => {
      const next = await library.read(ref);
      if (current()) commit(next, { ...ref });
    });
  }

  function refreshBuiltin(scoreId: string) {
    const ref = opened.value;
    if (ref?.sourceId !== builtinSource.id || ref.scoreId !== scoreId) {
      void library.refresh(builtinSource.id).catch(() => {});
      return Promise.resolve(false);
    }
    return readScore(async (current) => {
      await library.refresh(builtinSource.id);
      const next = await library.read(ref);
      if (current()) commit(next, ref);
    });
  }

  function initialize() {
    if (score.value) return Promise.resolve(true);
    return readScore(async (current) => {
      const ref = saved.version === savedScoreVersion ? saved.opened : null;
      if (ref && library.sources.some((source) => source.id === ref.sourceId)) {
        try {
          const entries = await library.list(ref.sourceId);
          if (!current()) return;
          if (entries.some((entry) => entry.id === ref.scoreId)) {
            const next = await library.read(ref);
            if (current()) commit(next, ref);
            return;
          }
        } catch {
          // An unavailable saved source falls back to the bundled examples.
          if (!current()) return;
        }
      }
      const entries = await library.list(builtinSource.id);
      if (!current()) return;
      const entry = entries[0];
      if (entry) {
        const ref = { sourceId: builtinSource.id, scoreId: entry.id };
        const next = await library.read(ref);
        if (current()) commit(next, ref);
      }
    });
  }

  return {
    score,
    opened,
    notes,
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
    open,
    refreshBuiltin,
    initialize,
  };
});

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useScoreStore, import.meta.hot));
