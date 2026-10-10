<script setup lang="ts">
import { useTemplateRef } from 'vue';
import { FolderOpen } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { useScoreStore } from '../stores/score';
import InfoPanel from './InfoPanel.vue';
import ScoreDialog from './ScoreDialog.vue';

const { score } = storeToRefs(useScoreStore());
const dialog = useTemplateRef<InstanceType<typeof ScoreDialog>>('dialog');
</script>

<template>
  <InfoPanel class="relative w-68 hover:bg-slate-100">
    <div class="flex h-full min-w-0 flex-col justify-center gap-1">
      <p class="line-clamp-2 leading-5 font-medium text-slate-900" :title="score?.title">
        {{ score?.title ?? 'No score loaded' }}
      </p>
      <p v-if="score" class="truncate text-xs leading-4 text-slate-900" :title="score.composer">
        <span class="text-slate-500">by</span> {{ score.composer }}
      </p>
      <button
        type="button"
        :title="score ? 'Music score' : 'Load score'"
        class="absolute inset-0 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        @click="dialog?.showModal()"
      >
        <FolderOpen :size="12" class="absolute top-1 right-1 text-slate-400" />
        <span class="sr-only">{{ score ? 'Music score' : 'Load score' }}</span>
      </button>
    </div>
  </InfoPanel>
  <ScoreDialog ref="dialog" />
</template>
