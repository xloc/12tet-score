<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue';
import MusicControls from './components/MusicControls.vue';
import MusicNotation from './components/MusicNotation.vue';
import MusicStatusBar from './components/MusicStatusBar.vue';
import { usePlaybackStore } from './stores/playback';
import { useScoreStore } from './stores/score';

const sheet = useScoreStore();
const playback = usePlaybackStore();
const notation = useTemplateRef<InstanceType<typeof MusicNotation>>('notation');

onMounted(() => {
  void sheet.initialize();
});
onBeforeUnmount(playback.stop);
</script>

<template>
  <main
    class="grid h-dvh grid-rows-[minmax(0,1fr)_auto_auto] overflow-hidden bg-white text-sm text-slate-900"
  >
    <MusicNotation
      v-if="sheet.score"
      ref="notation"
      :notes="sheet.score.notes"
      :total-ticks="sheet.totalTicks"
      :ppq="sheet.score.ppq"
      :ticks-per-bar="sheet.ticksPerBar"
      :fold-threshold="sheet.foldThreshold"
      :playhead="playback.currentTick"
      :playing="playback.playing"
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
    <MusicStatusBar />
  </main>
</template>
