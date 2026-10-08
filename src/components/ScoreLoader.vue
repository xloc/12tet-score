<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { FileUp } from '@lucide/vue';
import { useFileDrop } from '../composables/useFileDrop';
import { useScoreStore } from '../stores/score';
import ControlButton from './ControlButton.vue';

const sheet = useScoreStore();
const tab = ref<'public' | 'upload'>('public');
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const { dragging, enter, over, leave, drop, reset, outside } = useFileDrop(
  () => dialog.value,
  selectFiles,
  () => sheet.loading,
);

watch(dragging, (active) => {
  if (active) tab.value = 'upload';
});

onMounted(() => {
  window.addEventListener('dragover', outside);
  window.addEventListener('drop', outside);
});
onBeforeUnmount(() => {
  window.removeEventListener('dragover', outside);
  window.removeEventListener('drop', outside);
});

defineExpose({
  showModal() {
    dialog.value?.showModal();
    if (!sheet.catalog.length && !sheet.loading) void sheet.initialize();
  },
});

async function load(source: File | string) {
  if (sheet.loading) return;
  const loaded =
    typeof source === 'string' ? await sheet.loadHosted(source) : await sheet.loadFile(source);
  if (loaded) dialog.value?.close();
}

function selectFiles(files: File[]) {
  if (sheet.loading) return;
  if (files.length !== 1) {
    sheet.error = 'Drop one JSON file at a time.';
    return;
  }
  const file = files[0]!;
  void load(file);
}

function selectFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) selectFiles([file]);
}
</script>

<template>
  <dialog
    ref="dialog"
    closedby="any"
    class="m-auto max-h-[calc(100dvh-2rem)] w-96 max-w-[calc(100vw-2rem)] overflow-auto rounded border bg-white p-4 text-sm text-slate-900 backdrop:bg-slate-900/20"
    :class="dragging ? 'border-teal-500' : 'border-slate-300'"
    @dragenter="enter"
    @dragover="over"
    @dragleave="leave"
    @drop="drop"
    @close="reset"
  >
    <div class="space-y-3">
      <h2 class="font-medium">Load score</h2>
      <fieldset :disabled="sheet.loading" class="space-y-3">
        <div class="flex gap-2">
          <ControlButton
            type="button"
            class="flex-1"
            :primary="tab === 'public'"
            @click="tab = 'public'"
          >
            Public resource
          </ControlButton>
          <ControlButton
            type="button"
            class="flex-1"
            :primary="tab === 'upload'"
            @click="tab = 'upload'"
          >
            Upload
          </ControlButton>
        </div>
        <div class="h-56">
          <div v-show="tab === 'public'" class="flex h-full min-h-0 flex-col gap-2">
            <ul v-if="sheet.catalog.length" class="min-h-0 flex-1 space-y-2 overflow-auto">
              <li v-for="entry in sheet.catalog" :key="entry.file">
                <button
                  type="button"
                  class="block w-full cursor-pointer rounded border border-slate-300 bg-white p-2 text-left enabled:hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                  @click="load(entry.file)"
                >
                  <span class="block font-medium text-slate-900">{{ entry.title }}</span>
                  <span class="block text-xs text-slate-500">{{ entry.composer }}</span>
                </button>
              </li>
            </ul>
            <p
              v-if="!sheet.catalog.length && !sheet.loading && !sheet.error"
              class="text-xs text-slate-500"
            >
              No scores available.
            </p>
          </div>
          <label
            v-show="tab === 'upload'"
            for="score-file"
            class="flex h-full flex-col items-center justify-center gap-2 rounded border-2 border-dashed p-4 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-teal-700"
            :class="
              sheet.loading
                ? 'cursor-not-allowed border-slate-300 bg-slate-50 opacity-40'
                : dragging
                  ? 'cursor-pointer border-teal-500 bg-teal-700/5'
                  : 'cursor-pointer border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100'
            "
          >
            <FileUp :size="24" :class="dragging ? 'text-teal-700' : 'text-slate-500'" />
            <span class="font-medium" :class="dragging ? 'text-teal-700' : 'text-slate-700'">
              {{ dragging ? 'Drop JSON file to load' : 'Drag a JSON file here' }}
            </span>
            <span class="text-xs text-slate-500">or click to choose a file</span>
            <input
              id="score-file"
              class="sr-only"
              type="file"
              accept=".json,application/json"
              @change="selectFile"
            />
          </label>
        </div>
      </fieldset>
      <p v-if="sheet.loading" class="text-xs text-slate-500">Loading score…</p>
      <p v-if="sheet.error" class="text-xs text-slate-500">{{ sheet.error }}</p>
    </div>
  </dialog>
</template>
