<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue';
import MusicControls from './components/MusicControls.vue';
import MusicNotation from './components/MusicNotation.vue';
import { usePlaybackStore } from './stores/playback';
import { useScoreStore } from './stores/score';
import { useMidiStore } from './stores/midi';
import { useFollowingStore } from './stores/following';

const sheet = useScoreStore();
const playback = usePlaybackStore();
const midi = useMidiStore();
const following = useFollowingStore();
const notation = useTemplateRef<InstanceType<typeof MusicNotation>>('notation');

function updateScore({ file }: { file: string }) {
  void sheet.refreshHosted(file);
}

onMounted(() => {
  void sheet.initialize();
  void midi.restoreBluetooth();
  import.meta.hot?.on('score-updated', updateScore);
});
onBeforeUnmount(() => {
  playback.stop();
  import.meta.hot?.off('score-updated', updateScore);
});
</script>

<template>
  <main class="relative grid h-dvh grid-rows-1 overflow-hidden bg-white text-sm text-slate-900">
    <MusicNotation
      v-if="sheet.score"
      ref="notation"
      :score="sheet.score"
      :total-ticks="sheet.totalTicks"
      :fold-threshold="sheet.foldThreshold"
      :variable-bar-width="sheet.variableBarWidth"
      :playhead="playback.currentTick"
      :pressed-pitches="midi.pressedPitches"
      :playing="playback.playing"
      :following="following.active && following.result?.tick !== undefined"
      :selection="sheet.selection"
      @select="sheet.selection = $event"
      @seek="playback.seek"
    />
    <div v-else class="min-h-0 overflow-auto">
      <p v-if="sheet.loading">Loading score…</p>
      <p v-else-if="sheet.error">{{ sheet.error }}</p>
      <p v-else>No score loaded.</p>
    </div>
    <MusicControls @scroll-to-playhead="notation?.scrollToPlayhead()" />
  </main>
</template>
