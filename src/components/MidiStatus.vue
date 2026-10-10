<script setup lang="ts">
import { computed } from 'vue';
import { pitchLabel } from '../music';
import { useMidiStore } from '../stores/midi';

const midi = useMidiStore();
const keys = computed(() => midi.pressedPitches.map(pitchLabel).join(' · '));
const status = computed(() => {
  if (midi.unavailable || midi.error) return midi.unavailable || midi.error;
  if (midi.connecting) return 'Connecting…';
  if (!midi.ready) return 'Not connected';
  return midi.connectedCount ? 'Connected' : 'No device';
});
const summary = computed(() => {
  if (midi.unavailable) return 'Unavailable';
  if (midi.error) return 'Error';
  if (midi.pressedPitches.length > 3) return `${midi.pressedPitches.length} notes`;
  return keys.value || status.value;
});
</script>

<template>
  <div class="min-w-0">
    <span class="block text-[10px] leading-3 text-slate-500">MIDI</span>
    <span class="block truncate leading-5 font-medium text-slate-900" :title="keys || status">{{
      summary
    }}</span>
  </div>
</template>
