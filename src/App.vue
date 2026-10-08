<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import MusicControls from './components/MusicControls.vue';
import MusicNotation from './components/MusicNotation.vue';
import MusicStatusBar from './components/MusicStatusBar.vue';
import { score, ticksPerBar, totalTicks } from './music';
import { usePlaybackStore } from './stores/playback';
import { useScoreStore } from './stores/score';

const sheet = useScoreStore();
const playback = usePlaybackStore();

onBeforeUnmount(playback.stop);
</script>

<template>
  <main
    class="grid h-dvh grid-rows-[minmax(0,1fr)_auto_auto] overflow-hidden bg-white text-sm text-slate-900"
  >
    <MusicNotation
      :notes="score.notes"
      :total-ticks="totalTicks"
      :ppq="score.ppq"
      :ticks-per-bar="ticksPerBar"
      :selection="sheet.selection"
      @select="sheet.selection = $event"
    />
    <MusicControls />
    <MusicStatusBar />
  </main>
</template>
