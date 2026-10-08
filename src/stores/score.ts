import { computed, ref } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import type { Score, ScoreEntry } from '../music.ts';
import { selectedIndices, selectionSpan, type MusicSelection } from '../selection.ts';

export const useScoreStore = defineStore('score', () => {
  const score = ref<Score | null>(null);
  const catalog = ref<ScoreEntry[]>([]);
  const loading = ref(false);
  const error = ref('');
  const totalTicks = computed(() =>
    Math.max(0, ...(score.value?.notes.map((note) => note.at + note.len) ?? [])),
  );
  const ticksPerBar = computed(() =>
    score.value ? (score.value.ppq * score.value.meter[0]! * 4) / score.value.meter[1]! : 0,
  );
  const barCount = computed(() =>
    ticksPerBar.value ? Math.ceil(totalTicks.value / ticksPerBar.value) : 0,
  );
  const foldThreshold = ref(12);
  const selection = ref<MusicSelection>({ kind: 'notes', indices: [] });
  const selectedNotes = computed(() =>
    score.value
      ? selectedIndices(score.value.notes, selection.value).map(
          (index) => score.value!.notes[index]!,
        )
      : [],
  );
  const span = computed(() =>
    score.value ? selectionSpan(score.value.notes, selection.value) : null,
  );

  function load(next: Score) {
    selection.value = { kind: 'notes', indices: [] };
    score.value = next;
  }

  async function readScore(read: () => Promise<void>) {
    loading.value = true;
    error.value = '';
    try {
      await read();
      return true;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      return false;
    } finally {
      loading.value = false;
    }
  }

  function loadFile(file: File) {
    return readScore(async () => {
      if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
        throw new Error('Choose a JSON score file.');
      }
      load(JSON.parse(await file.text()));
    });
  }

  async function readJSON<T>(file: string): Promise<T> {
    const response = await fetch(`${import.meta.env.BASE_URL}scores/${file}`);
    if (!response.ok) throw new Error(`Could not load score (${response.status}).`);
    return response.json();
  }

  function loadHosted(file: string) {
    return readScore(async () => load(await readJSON<Score>(file)));
  }

  function initialize() {
    return readScore(async () => {
      catalog.value = await readJSON<ScoreEntry[]>('index.json');
      if (!score.value && catalog.value.length) {
        load(await readJSON<Score>(catalog.value[0]!.file));
      }
    });
  }

  return {
    score,
    catalog,
    loading,
    error,
    totalTicks,
    ticksPerBar,
    barCount,
    foldThreshold,
    selection,
    selectedNotes,
    span,
    load,
    loadFile,
    loadHosted,
    initialize,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useScoreStore, import.meta.hot));
}
