<script setup lang="ts">
import { onBeforeUnmount, useTemplateRef } from 'vue';
import MusicControls from './components/MusicControls.vue';
import MusicNotation from './components/MusicNotation.vue';
import MusicStatusBar from './components/MusicStatusBar.vue';
import { score, ticksPerBar, totalTicks } from './music';
import { usePlaybackStore } from './stores/playback';
import { useScoreStore } from './stores/score';

const sheet = useScoreStore();
const playback = usePlaybackStore();
const notation = useTemplateRef<InstanceType<typeof MusicNotation>>('notation');

onBeforeUnmount(playback.stop);
</script>

<template>
  <main
    class="grid h-dvh grid-rows-[minmax(0,1fr)_auto_auto] overflow-hidden bg-white text-sm text-slate-900"
  >
    <MusicNotation
      ref="notation"
      :notes="score.notes"
      :total-ticks="totalTicks"
      :ppq="score.ppq"
      :ticks-per-bar="ticksPerBar"
      :fold-threshold="sheet.foldThreshold"
      :playhead="playback.currentTick"
      :playing="playback.playing"
      :selection="sheet.selection"
      @select="sheet.selection = $event"
      @seek="playback.seek"
    />
    <MusicControls @scroll-to-playhead="notation?.scrollToPlayhead()" />
    <MusicStatusBar />
  </main>
</template>
