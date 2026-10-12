<script setup lang="ts">
import { computed } from 'vue';
import type { PitchRow } from '../layout';
import { pitchLabel } from '../music';

const props = defineProps<{ rows: PitchRow[]; pitches: number[] }>();
const markers = computed(() => {
  const highest = props.rows[0];
  const lowest = props.rows.at(-1);
  return [
    {
      kind: 'above',
      row: 1,
      pitches: props.pitches.filter((pitch) => typeof highest === 'number' && pitch > highest),
    },
    ...props.rows.map((row, index) => ({
      kind: typeof row === 'number' ? 'pitch' : 'folded',
      row: index + 1,
      pitches: props.pitches.filter((pitch) =>
        typeof row === 'number' ? pitch === row : pitch >= row.from && pitch <= row.to,
      ),
    })),
    {
      kind: 'below',
      row: props.rows.length,
      pitches: props.pitches.filter((pitch) => typeof lowest === 'number' && pitch < lowest),
    },
  ].filter((marker) => marker.pitches.length);
});
</script>

<template>
  <span v-if="markers.length" data-midi-overlay class="contents">
    <template v-for="marker in markers" :key="`${marker.kind}-${marker.row}`">
      <span
        v-if="marker.kind === 'pitch'"
        data-midi-line
        :data-midi-pitch="marker.pitches[0]"
        class="pointer-events-none relative z-15 h-px self-center bg-lime-600"
        :style="{ gridRow: marker.row, gridColumn: '1 / -1' }"
      ></span>
      <span
        v-else
        data-midi-hidden
        :data-midi-kind="marker.kind"
        class="relative z-15 max-w-full justify-self-end truncate text-[10px] leading-2 text-lime-600"
        :class="marker.kind === 'below' ? 'self-end' : 'self-start'"
        :style="{ gridRow: marker.row, gridColumn: '1 / -1' }"
        :title="`Pressed keys ${marker.kind === 'above' ? 'above the visible range' : marker.kind === 'below' ? 'below the visible range' : 'in the folded gap'}: ${marker.pitches.map(pitchLabel).join(', ')}`"
      >
        {{ marker.kind === 'above' ? '↑' : marker.kind === 'below' ? '↓' : '↕'
        }}{{ marker.pitches.length }}
      </span>
    </template>
  </span>
</template>
