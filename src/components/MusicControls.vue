<script setup lang="ts">
import { computed, nextTick } from 'vue';
import { LocateFixed, Pause, Play, SkipBack, SquarePlay } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { usePlaybackStore } from '../stores/playback';
import { useScoreStore } from '../stores/score';
import ContextInspector from './ContextInspector.vue';
import ControlButton from './ControlButton.vue';
import InfoPanel from './InfoPanel.vue';
import ScorePanel from './ScorePanel.vue';

const emit = defineEmits<{ scrollToPlayhead: [] }>();
const sheet = useScoreStore();
const { score, totalTicks } = storeToRefs(sheet);
const playback = usePlaybackStore();
const playLabel = computed(() =>
  playback.playing ? 'Pause' : playback.paused ? 'Resume' : 'Play',
);

function togglePlayback() {
  if (!score.value) return;
  if (playback.playing) return playback.pause();
  if (playback.paused) return playback.resume();
  return playback.play(
    score.value.notes,
    playback.currentTick < totalTicks.value ? playback.currentTick : 0,
    totalTicks.value,
  );
}

async function goToStart() {
  await playback.seek(0);
  await nextTick();
  emit('scrollToPlayhead');
}
</script>

<template>
  <aside class="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex gap-3 overflow-x-auto">
    <InfoPanel v-if="score" class="w-48">
      <div class="flex items-center gap-2">
        <ControlButton primary icon-only :title="playLabel" @click="togglePlayback">
          <Pause v-if="playback.playing" :size="16" />
          <Play v-else :size="16" />
          <span class="sr-only">{{ playLabel }}</span>
        </ControlButton>
        <ControlButton
          icon-only
          :disabled="!sheet.selectedNotes.length || playback.playing"
          title="Play selection"
          @click="playback.play(sheet.selectedNotes, sheet.span!.from, sheet.span!.to)"
        >
          <SquarePlay :size="16" />
          <span class="sr-only">Play selection</span>
        </ControlButton>
        <ControlButton icon-only title="Go to start" @click="goToStart">
          <SkipBack :size="16" />
          <span class="sr-only">Go to start</span>
        </ControlButton>
        <ControlButton icon-only title="Scroll to playhead" @click="emit('scrollToPlayhead')">
          <LocateFixed :size="16" />
          <span class="sr-only">Scroll to playhead</span>
        </ControlButton>
      </div>
      <div class="space-y-1">
        <div class="font-medium text-slate-900 tabular-nums">
          {{ (playback.currentTick / score.ppq).toFixed(1) }}
          <span class="text-xs font-normal text-slate-500"
            >/ {{ totalTicks / score.ppq }} beats</span
          >
        </div>
        <progress
          class="block h-1.5 w-full accent-teal-700"
          :max="totalTicks"
          :value="playback.currentTick"
        ></progress>
      </div>
    </InfoPanel>

    <ContextInspector />
    <ScorePanel />
  </aside>
</template>
