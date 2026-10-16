<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { FileUp, FolderOpen, Globe, LibraryBig, Plus, RefreshCw, Trash2 } from '@lucide/vue';
import { useFileDrop } from '../composables/useFileDrop';
import { builtinSource, localSource } from '../library';
import { useLibraryStore } from '../stores/library';
import { useScoreStore } from '../stores/score';
import ControlButton from './ControlButton.vue';

const sheet = useScoreStore();
const library = useLibraryStore();
const sourceId = ref(sheet.opened?.sourceId ?? builtinSource.id);
const selectedSource = computed(() =>
  library.sources.find((source) => source.id === sourceId.value),
);
const listing = computed(() => library.listings[sourceId.value]);
const catalogUrl = ref('');
const showSiteForm = ref(false);
const importedCount = ref(0);
const minSidebarWidth = 176;
const sidebarWidth = ref(208);
const sidebarResize = ref<{
  id: number;
  target: HTMLElement;
  x: number;
  width: number;
} | null>(null);
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const sidebar = useTemplateRef<HTMLDivElement>('sidebar');
const catalogInput = useTemplateRef<HTMLInputElement>('catalogInput');
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');
const { dragging, enter, over, leave, drop, reset, outside } = useFileDrop(
  () => dialog.value,
  selectFiles,
  () => library.importing,
);

watch(dragging, (active) => {
  if (active) selectSource(localSource.id);
});
watch(
  () => sheet.opened?.sourceId,
  (id) => {
    if (id) sourceId.value = id;
  },
);
watch(
  () => library.sources,
  (sources) => {
    if (!sources.some((source) => source.id === sourceId.value)) sourceId.value = builtinSource.id;
  },
);
watch(sourceId, () => {
  if (dialog.value?.open) void loadListing();
});

onMounted(() => {
  window.addEventListener('dragover', outside);
  window.addEventListener('drop', outside);
});
onBeforeUnmount(() => {
  stopSidebarResize();
  window.removeEventListener('dragover', outside);
  window.removeEventListener('drop', outside);
});

defineExpose({
  showModal() {
    showSiteForm.value = false;
    dialog.value?.showModal();
    void loadListing();
  },
});

function startSidebarResize(event: PointerEvent) {
  if (event.button !== 0 || !event.isPrimary || sidebarResize.value || !sidebar.value) return;
  const target = event.currentTarget as HTMLElement;
  event.preventDefault();
  target.focus({ preventScroll: true });
  sidebarResize.value = {
    id: event.pointerId,
    target,
    x: event.clientX,
    width: sidebar.value.getBoundingClientRect().width,
  };
  target.setPointerCapture(event.pointerId);
}

function moveSidebarResize(event: PointerEvent) {
  const drag = sidebarResize.value;
  if (drag?.id !== event.pointerId || !dialog.value) return;
  sidebarWidth.value = Math.max(
    minSidebarWidth,
    Math.min(drag.width + event.clientX - drag.x, dialog.value.clientWidth / 2),
  );
}

function stopSidebarResize(event?: PointerEvent) {
  const drag = sidebarResize.value;
  if (!drag || (event && event.pointerId !== drag.id)) return;
  sidebarResize.value = null;
  if (drag.target.hasPointerCapture(drag.id)) drag.target.releasePointerCapture(drag.id);
}

function selectSource(id: string) {
  sourceId.value = id;
  showSiteForm.value = false;
}

async function showAddSite() {
  library.siteError = '';
  showSiteForm.value = true;
  await nextTick();
  catalogInput.value?.focus();
}

async function loadListing(refresh = false) {
  try {
    if (refresh) await library.refresh(sourceId.value);
    else await library.list(sourceId.value);
  } catch {
    // The selected source displays its own loading error.
  }
}

async function open(scoreId: string) {
  await sheet.open({ sourceId: sourceId.value, scoreId });
}

async function selectFiles(files: File[]) {
  importedCount.value = 0;
  const refs = await library.importFiles(files);
  importedCount.value = refs.length;
  selectSource(localSource.id);
}

function selectFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length) void selectFiles(files);
}

async function addSite() {
  const added = await library.addSite(catalogUrl.value);
  if (added) {
    selectSource(added.id);
    catalogUrl.value = '';
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    closedby="any"
    class="pointer-events-auto m-auto h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] w-[64rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-slate-100 text-[13px] text-slate-900 backdrop:bg-slate-900/20"
    :class="dragging ? 'border-teal-500' : 'border-slate-200'"
    @dragenter="enter"
    @dragover="over"
    @dragleave="leave"
    @drop="drop"
    @close="
      reset();
      stopSidebarResize();
      showSiteForm = false;
    "
  >
    <div
      class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] sm:grid-rows-1"
      :class="sidebarResize ? 'select-none' : ''"
      :style="{ '--sidebar-width': `clamp(${minSidebarWidth}px, ${sidebarWidth}px, 50%)` }"
    >
      <div
        ref="sidebar"
        class="relative flex min-h-0 min-w-0 flex-col gap-3 border-b border-slate-200 p-3 sm:border-r sm:border-b-0"
      >
        <h2 class="hidden shrink-0 px-3 py-1 text-sm font-medium sm:block">
          {{ sheet.score ? 'Change score' : 'Load score' }}
        </h2>
        <nav class="flex min-h-0 gap-1 sm:flex-1 sm:flex-col">
          <div
            class="flex min-h-0 min-w-0 flex-1 gap-1 overflow-x-auto overscroll-contain sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto"
          >
            <button
              v-for="source in library.sources"
              :key="source.id"
              type="button"
              :title="source.name"
              class="flex max-w-48 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700 sm:max-w-none"
              :class="
                !showSiteForm && sourceId === source.id
                  ? 'bg-teal-700/10 font-medium text-teal-800'
                  : 'text-slate-600 hover:bg-slate-200/70'
              "
              @click="selectSource(source.id)"
            >
              <LibraryBig v-if="source.id === builtinSource.id" :size="16" class="shrink-0" />
              <FolderOpen v-else-if="source.kind === 'local'" :size="16" class="shrink-0" />
              <Globe v-else :size="16" class="shrink-0" />
              <span class="truncate">{{ source.name }}</span>
            </button>
          </div>
          <button
            type="button"
            title="Add site"
            class="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700"
            :class="
              showSiteForm
                ? 'bg-teal-700/10 font-medium text-teal-800'
                : 'text-slate-500 hover:bg-slate-200/70'
            "
            @click="showAddSite"
          >
            <Plus :size="16" class="shrink-0" />
            Add site
          </button>
        </nav>

        <aside
          v-if="sheet.score || sheet.error"
          class="max-h-[40dvh] shrink-0 space-y-3 overflow-y-auto overscroll-contain rounded-lg bg-white p-3 sm:max-h-[55%]"
        >
          <div class="space-y-1">
            <p class="text-xs text-slate-500">
              {{ sheet.score ? 'Current score' : 'Score' }}
            </p>
            <template v-if="sheet.score">
              <h3 class="text-sm font-medium break-words">{{ sheet.score.title }}</h3>
              <p class="break-words text-slate-500">{{ sheet.score.composer }}</p>
            </template>
          </div>
          <p v-if="sheet.error" class="text-xs break-words text-red-600">{{ sheet.error }}</p>
          <dl v-if="sheet.score" class="grid grid-cols-2 gap-3 text-xs sm:grid-cols-1">
            <div v-if="sheet.score.collection" class="min-w-0 space-y-1">
              <dt class="text-slate-500">Collection</dt>
              <dd class="break-words">{{ sheet.score.collection }}</dd>
            </div>
            <div class="min-w-0 space-y-1">
              <dt class="text-slate-500">Source</dt>
              <dd class="break-words">
                <a
                  class="text-teal-700 underline underline-offset-2"
                  :href="sheet.score.source.url"
                >
                  {{ sheet.score.source.name }}
                </a>
              </dd>
            </div>
            <div class="min-w-0 space-y-1">
              <dt class="text-slate-500">License</dt>
              <dd class="break-words">{{ sheet.score.source.license }}</dd>
            </div>
          </dl>
        </aside>
        <button
          type="button"
          title="Resize sidebar"
          class="absolute inset-y-0 -right-1 z-10 hidden w-2 touch-none cursor-col-resize hover:bg-teal-700/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700 sm:block"
          :class="sidebarResize ? 'bg-teal-700/10' : ''"
          @pointerdown="startSidebarResize"
          @pointermove="moveSidebarResize"
          @pointerup="stopSidebarResize"
          @pointercancel="stopSidebarResize"
          @lostpointercapture="stopSidebarResize"
        >
          <span class="sr-only">Resize sidebar</span>
        </button>
      </div>

      <div class="flex min-h-0 min-w-0 flex-col bg-white">
        <form
          v-if="showSiteForm"
          class="flex min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
          @submit.prevent="addSite"
        >
          <fieldset :disabled="library.addingSite" class="m-auto w-full min-w-0 max-w-md space-y-4">
            <legend class="mb-4 text-sm font-medium">Add site</legend>
            <div class="space-y-1.5">
              <label for="score-site-url" class="block">Catalog URL</label>
              <input
                id="score-site-url"
                ref="catalogInput"
                v-model="catalogUrl"
                class="block h-9 w-full min-w-0 rounded border border-slate-300 bg-slate-50 px-3 text-[13px] placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-40"
                type="url"
                placeholder="https://example.org/scores/index.json"
                :spellcheck="false"
                autocapitalize="none"
                required
              />
            </div>
            <p v-if="library.siteError" class="text-xs break-words text-red-600">
              {{ library.siteError }}
            </p>
            <div class="flex justify-end gap-2">
              <ControlButton type="button" @click="showSiteForm = false">Cancel</ControlButton>
              <ControlButton primary type="submit" :disabled="!catalogUrl.trim()">
                {{ library.addingSite ? 'Adding site…' : 'Add site' }}
              </ControlButton>
            </div>
          </fieldset>
        </form>

        <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            class="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3"
          >
            <div class="min-w-0 flex-1">
              <h3 class="truncate text-sm font-medium" :title="selectedSource?.name">
                {{ selectedSource?.name }}
              </h3>
              <p
                class="flex h-4 items-center gap-2 overflow-hidden text-xs whitespace-nowrap text-slate-500"
              >
                <span v-if="listing?.loaded" class="shrink-0 tabular-nums">
                  {{ listing.entries.length }}
                  {{ listing.entries.length === 1 ? 'score' : 'scores' }}
                </span>
                <span class="truncate">{{
                  listing?.loading ? 'Loading scores…' : sheet.loading ? 'Loading score…' : ''
                }}</span>
              </p>
            </div>
            <template v-if="selectedSource?.kind === 'local'">
              <ControlButton
                type="button"
                title="Import scores"
                class="shrink-0 gap-1.5"
                :disabled="library.importing"
                @click="fileInput?.click()"
              >
                <FileUp :size="16" />
                Import scores
              </ControlButton>
              <input
                ref="fileInput"
                class="hidden"
                type="file"
                accept=".json,application/json"
                multiple
                :disabled="library.importing"
                @change="selectFile"
              />
            </template>
            <ControlButton
              icon-only
              type="button"
              title="Refresh scores"
              class="shrink-0"
              :disabled="
                listing?.loading || (selectedSource?.kind === 'local' && library.importing)
              "
              @click="loadListing(true)"
            >
              <RefreshCw :size="14" :class="listing?.loading ? 'motion-safe:animate-spin' : ''" />
              <span class="sr-only">Refresh scores</span>
            </ControlButton>
            <button
              v-if="selectedSource?.kind === 'catalog' && selectedSource.id !== builtinSource.id"
              type="button"
              title="Remove site"
              class="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              @click="library.removeSite(sourceId)"
            >
              <Trash2 :size="15" />
              <span class="sr-only">Remove site</span>
            </button>
          </div>
          <div
            v-if="
              listing?.error ||
              (selectedSource?.kind === 'local' &&
                (library.importing || importedCount || library.importError))
            "
            class="max-h-24 shrink-0 space-y-1 overflow-y-auto border-b border-slate-100 px-4 py-2 text-xs text-slate-500"
          >
            <p v-if="listing?.error" class="break-words text-red-600">{{ listing.error }}</p>
            <template v-if="selectedSource?.kind === 'local'">
              <p v-if="library.importing">Importing scores…</p>
              <p v-if="importedCount">
                Imported {{ importedCount }} {{ importedCount === 1 ? 'score' : 'scores' }}. Choose
                a score to open.
              </p>
              <p v-if="library.importError" class="break-words whitespace-pre-line text-red-600">
                {{ library.importError }}
              </p>
            </template>
          </div>
          <div class="relative min-h-0 flex-1">
            <ul
              v-if="listing?.entries.length"
              class="h-full divide-y divide-slate-100 overflow-y-auto overscroll-contain px-3"
            >
              <li
                v-for="entry in listing.entries"
                :key="entry.id"
                class="flex items-center gap-2 rounded"
                :class="
                  sheet.opened?.sourceId === sourceId && sheet.opened.scoreId === entry.id
                    ? 'bg-teal-700/15 text-teal-800 hover:bg-teal-700/20'
                    : 'hover:bg-slate-50'
                "
              >
                <button
                  type="button"
                  class="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center rounded px-2 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700"
                  @click="open(entry.id)"
                >
                  <span
                    class="grid min-w-0 flex-1 gap-0.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-baseline sm:gap-4"
                  >
                    <span class="block font-medium break-words">{{ entry.title }}</span>
                    <span class="block text-xs break-words text-slate-500 sm:text-right">
                      by {{ entry.composer }}
                    </span>
                  </span>
                  <span
                    v-if="sheet.opened?.sourceId === sourceId && sheet.opened.scoreId === entry.id"
                    class="sr-only"
                  >
                    Current score
                  </span>
                </button>
                <button
                  v-if="selectedSource?.kind === 'local'"
                  type="button"
                  :title="`Remove ${entry.title}`"
                  class="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded text-slate-400 enabled:hover:bg-red-50 enabled:hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="library.importing"
                  @click="library.removeLocal(entry.id)"
                >
                  <Trash2 :size="15" />
                  <span class="sr-only">Remove {{ entry.title }}</span>
                </button>
              </li>
            </ul>
            <div
              v-else-if="!listing?.loading && !listing?.error"
              class="flex h-full flex-col items-center justify-center gap-2 overflow-y-auto p-6 text-center text-slate-500"
            >
              <FolderOpen
                v-if="selectedSource?.kind === 'local'"
                :size="28"
                class="text-slate-300"
              />
              <LibraryBig v-else :size="28" class="text-slate-300" />
              <p>No scores available.</p>
              <p v-if="selectedSource?.kind === 'local'" class="text-xs">
                Import JSON files or drop them here.
              </p>
            </div>
            <div
              v-if="dragging"
              class="pointer-events-none absolute inset-2 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-teal-500 bg-teal-50/95 p-4 text-center text-teal-700"
            >
              <FileUp :size="28" />
              <p class="font-medium">Drop JSON files to import</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </dialog>
</template>
