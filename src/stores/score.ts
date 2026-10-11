import { computed, ref } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { scoreDuration, type Score, type ScoreEntry } from '../music.ts';
import { scoreBars, validateTempos } from '../timing';
import { selectedIndices, selectionSpan, type MusicSelection } from '../selection.ts';

export const useScoreStore = defineStore('score', () => {
  const score = ref<Score | null>(null);
  const catalog = ref<ScoreEntry[]>([]);
  const loading = ref(false);
  const error = ref('');
  const totalTicks = computed(() => (score.value ? scoreDuration(score.value) : 0));
  const bars = computed(() =>
    score.value
      ? scoreBars(totalTicks.value, score.value.ppq, score.value.meters, score.value.sections)
      : [],
  );
  const barCount = computed(() => bars.value.length);
  const foldThreshold = ref(12);
  const variableBarWidth = ref(false);
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
    if (!Number.isFinite(next.ppq) || next.ppq <= 0) throw new Error('PPQ must be positive.');
    validateTempos(next.tempos);
    scoreBars(scoreDuration(next), next.ppq, next.meters, next.sections);
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
    initialize,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useScoreStore, import.meta.hot));
}
