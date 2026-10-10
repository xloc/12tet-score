<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { FileUp, LibraryBig } from '@lucide/vue';
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
    class="pointer-events-auto m-auto max-h-[calc(100dvh-2rem)] w-96 max-w-[calc(100vw-2rem)] overflow-auto rounded-xl border bg-slate-100 p-4 text-[13px] text-slate-900 backdrop:bg-slate-900/20"
    :class="dragging ? 'border-teal-500' : 'border-slate-200'"
    @dragenter="enter"
    @dragover="over"
    @dragleave="leave"
    @drop="drop"
    @close="reset"
  >
    <div class="space-y-5">
      <fieldset v-if="sheet.score" class="min-w-0">
        <legend class="mb-1.5 px-3 text-xs text-slate-500">Current score</legend>
        <div class="divide-y divide-slate-100 rounded-xl bg-white px-3">
          <h2 class="py-3 text-sm font-medium">{{ sheet.score.title }}</h2>
          <dl class="divide-y divide-slate-100">
            <div class="flex items-baseline justify-between gap-3 py-3">
              <dt class="shrink-0">Composer</dt>
              <dd class="min-w-0 text-right break-words text-slate-500">
                {{ sheet.score.composer }}
              </dd>
            </div>
            <div
              v-if="sheet.score.collection"
              class="flex items-baseline justify-between gap-3 py-3"
            >
              <dt class="shrink-0">Collection</dt>
              <dd class="min-w-0 text-right break-words text-slate-500">
                {{ sheet.score.collection }}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-3 py-3">
              <dt class="shrink-0">Source</dt>
              <dd class="min-w-0 text-right break-words">
                <a
                  class="text-teal-700 underline underline-offset-2"
                  :href="sheet.score.source.url"
                >
                  {{ sheet.score.source.name }}
                </a>
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-3 py-3">
              <dt class="shrink-0">License</dt>
              <dd class="min-w-0 text-right break-words text-slate-500">
                {{ sheet.score.source.license }}
              </dd>
            </div>
          </dl>
        </div>
      </fieldset>
      <fieldset :disabled="sheet.loading" class="min-w-0">
        <legend class="mb-1.5 px-3 text-xs text-slate-500">
          {{ sheet.score ? 'Change score' : 'Load score' }}
        </legend>
        <div class="space-y-3 rounded-xl bg-white p-3">
          <div class="flex gap-2">
            <ControlButton
              type="button"
              icon-only
              class="flex-1"
              title="Public resource"
              :primary="tab === 'public'"
              @click="tab = 'public'"
            >
              <LibraryBig :size="16" />
              <span class="sr-only">Public resource</span>
            </ControlButton>
            <ControlButton
              type="button"
              icon-only
              class="flex-1"
              title="Upload"
              :primary="tab === 'upload'"
              @click="tab = 'upload'"
            >
              <FileUp :size="16" />
              <span class="sr-only">Upload</span>
            </ControlButton>
          </div>
          <div class="h-56">
            <div v-show="tab === 'public'" class="flex h-full min-h-0 flex-col gap-2">
              <ul
                v-if="sheet.catalog.length"
                class="min-h-0 flex-1 divide-y divide-slate-100 overflow-auto"
              >
                <li v-for="entry in sheet.catalog" :key="entry.file">
                  <button
                    type="button"
                    class="block w-full cursor-pointer rounded py-2.5 text-left enabled:hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                    @click="load(entry.file)"
                  >
                    <span class="block font-medium text-slate-900">{{ entry.title }}</span>
                    <span class="block text-xs text-slate-900">
                      <span class="text-slate-500">by</span> {{ entry.composer }}
                    </span>
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
          <p v-if="sheet.loading" class="text-xs text-slate-500">Loading score…</p>
          <p v-if="sheet.error" class="text-xs text-slate-500">{{ sheet.error }}</p>
        </div>
      </fieldset>
    </div>
  </dialog>
</template>
