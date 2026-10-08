<script setup lang="ts">
import { useTemplateRef } from 'vue';
import { score } from '../music';

const pieceInfo = useTemplateRef<HTMLDialogElement>('pieceInfo');
</script>

<template>
  <footer
    class="flex h-6 min-w-0 items-center border-t border-slate-200 bg-slate-50 text-xs text-slate-600"
  >
    <button
      type="button"
      class="h-full min-w-0 max-w-full cursor-pointer truncate px-2 text-left hover:bg-slate-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700"
      :title="score.title"
      @click="pieceInfo?.showModal()"
    >
      {{ score.title }}
    </button>
  </footer>

  <dialog
    ref="pieceInfo"
    closedby="any"
    class="m-auto max-h-[calc(100dvh-2rem)] w-96 max-w-[calc(100vw-2rem)] overflow-auto rounded border border-slate-300 bg-white p-4 text-sm text-slate-900 backdrop:bg-slate-900/20"
  >
    <div class="space-y-3">
      <h2 class="font-medium">{{ score.title }}</h2>
      <dl class="space-y-2">
        <div>
          <dt class="text-xs text-slate-500">Composer</dt>
          <dd class="font-medium text-slate-900 tabular-nums">{{ score.composer }}</dd>
        </div>
        <div>
          <dt class="text-xs text-slate-500">Collection</dt>
          <dd class="font-medium text-slate-900 tabular-nums">{{ score.collection }}</dd>
        </div>
        <div>
          <dt class="text-xs text-slate-500">Source</dt>
          <dd>
            <a class="text-slate-700 underline underline-offset-2" :href="score.source.url">
              {{ score.source.name }}
            </a>
          </dd>
        </div>
        <div>
          <dt class="text-xs text-slate-500">License</dt>
          <dd class="font-medium text-slate-900 tabular-nums">{{ score.source.license }}</dd>
        </div>
      </dl>
      <p class="text-xs text-slate-500">Higher means higher pitch; longer means held longer.</p>
    </div>
  </dialog>
</template>
