<script setup lang="ts">
import { computed } from 'vue';
import { pitchLabel } from '../music';
import { useMidiStore } from '../stores/midi';
import ControlButton from './ControlButton.vue';
import InfoPanel from './InfoPanel.vue';

const midi = useMidiStore();
const devices = computed(
  () =>
    Object.values(midi.inputs)
      .map(
        (input) =>
          `${input.name || 'Unnamed MIDI input'}${input.state === 'disconnected' ? ' (disconnected)' : ''}`,
      )
      .join(' · ') || '—',
);
const keys = computed(() => midi.pressedPitches.map(pitchLabel).join(' · ') || '—');
const status = computed(() => {
  if (midi.unavailable || midi.error) return midi.unavailable || midi.error;
  if (midi.connecting) return 'Connecting…';
  if (!midi.ready) return 'Not connected';
  return midi.connectedCount ? 'Connected' : 'No device';
});
</script>

<template>
  <InfoPanel class="h-24">
    <dl class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3">
      <div class="min-w-0">
        <dt class="h-4 truncate text-xs text-slate-500">MIDI device</dt>
        <dd class="h-5 truncate font-medium text-slate-900" :title="devices">
          {{ devices }}
        </dd>
      </div>
      <div class="min-w-0">
        <dt class="h-4 truncate text-xs text-slate-500">Pressed keys</dt>
        <dd class="h-5 truncate font-medium text-slate-900" :title="keys">
          {{ keys }}
        </dd>
      </div>
    </dl>
    <div class="flex h-6 items-center gap-2">
      <span class="min-w-0 flex-1 truncate text-xs text-slate-500" :title="status">
        {{ status }}
      </span>
      <ControlButton
        v-if="!midi.unavailable && !midi.ready"
        compact
        type="button"
        title="Connect MIDI"
        :disabled="midi.connecting"
        @click="midi.connect"
      >
        Connect
      </ControlButton>
    </div>
  </InfoPanel>
</template>
