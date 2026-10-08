import { computed, ref } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { score } from '../music.ts';
import { selectedIndices, selectionSpan, type MusicSelection } from '../selection.ts';

export const useScoreStore = defineStore('score', () => {
  const foldThreshold = ref(12);
  const selection = ref<MusicSelection>({ kind: 'notes', indices: [] });
  const selectedNotes = computed(() =>
    selectedIndices(score.notes, selection.value).map((index) => score.notes[index]!),
  );
  const span = computed(() => selectionSpan(score.notes, selection.value));
  return { foldThreshold, selection, selectedNotes, span };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useScoreStore, import.meta.hot));
}
