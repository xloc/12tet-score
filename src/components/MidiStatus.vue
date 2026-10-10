<script setup lang="ts">
import { computed } from 'vue';
import { chordNames } from '../chords';
import { pitchLabel } from '../music';
import { useMidiStore } from '../stores/midi';

const midi = useMidiStore();
const count = computed(() => midi.pressedPitches.length);
const keys = computed(() => midi.pressedPitches.map(pitchLabel).join(' · '));
const chord = computed(() =>
  count.value > 1 ? chordNames(midi.pressedPitches.map((pitch) => ({ pitch })))[0] : undefined,
);
const unavailable = computed(() => midi.bluetoothUnavailable && midi.unavailable);
const error = computed(() => midi.error || midi.bluetoothError);
const status = computed(() => {
  if (midi.connectedCount) return 'Connected';
  if (midi.connecting || midi.bluetoothConnecting) return 'Connecting…';
  if (unavailable.value || error.value) return unavailable.value || error.value;
  return midi.ready || midi.bluetoothReady ? 'No device' : 'Not connected';
});
const summary = computed(() => {
  if (!midi.connectedCount && !midi.connecting && !midi.bluetoothConnecting) {
    if (unavailable.value) return 'Unavailable';
    if (error.value) return 'Error';
  }
  if (count.value) return chord.value || keys.value;
  return status.value;
});
</script>

<template>
  <div class="min-w-0">
    <span class="block text-[10px] leading-3 text-slate-500">MIDI</span>
    <span class="flex min-w-0 leading-5 font-medium text-slate-900" :title="keys || status">
      <span class="min-w-0 truncate">{{ summary }}</span>
      <span v-if="count" class="shrink-0 whitespace-pre">{{
        ` · ${count} ${count === 1 ? 'note' : 'notes'}`
      }}</span>
    </span>
  </div>
</template>
