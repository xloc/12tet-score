<script setup lang="ts">
import { computed } from 'vue';
import { annotationPlacements, type DisplayAnnotation } from '../annotations';
import type { Annotation } from '../music';
import type { ScoreLine } from '../layout';
import type { TimeLine } from '../selection';

const props = defineProps<{
  items: DisplayAnnotation[];
  line: ScoreLine;
  geometry?: TimeLine;
}>();
const hovered = defineModel<Annotation | null>('hovered', { default: null });
const placements = computed(() => {
  let left = 0;
  const bars =
    props.geometry?.bars ??
    props.line.bars.map((bar) => {
      const result = { ...bar, left, right: left + bar.preferred };
      left += bar.preferred;
      return result;
    });
  return annotationPlacements(props.items, props.line.from, props.line.to, bars, () => 0);
});
</script>

<template>
  <div
    v-if="placements.length"
    data-label-obstacle
    data-sustain-lane
    class="relative grid min-w-0 grid-cols-1 items-end text-xs leading-4 text-slate-600"
  >
    <div
      v-for="(placement, index) in placements"
      :key="index"
      data-annotation-kind="pedal"
      :data-annotation-start="placement.item.at"
      :data-annotation-highlighted="hovered === placement.item ? '' : undefined"
      class="relative min-w-0"
      :style="{
        gridColumn: '1',
        gridRow: '1',
        left: `${placement.left}px`,
        width: `${placement.spanWidth}px`,
      }"
      :title="`Sustain pedal${placement.item.text ? `: ${placement.item.text}` : ''}`"
      @pointerenter="hovered = placement.item"
      @pointerleave="hovered = null"
    >
      <div data-sustain-range class="relative h-[3px]">
        <div data-sustain-hit class="absolute -inset-y-1 inset-x-0"></div>
        <span
          class="pointer-events-none absolute top-1/2 h-[3px] -translate-y-1/2"
          :class="[
            hovered === placement.item ? 'bg-slate-600' : 'bg-slate-400',
            placement.continuesBefore ? 'left-0' : 'left-[2px] rounded-l-full',
            placement.continuesAfter ? 'right-0' : 'right-[2px] rounded-r-full',
          ]"
        ></span>
        <span
          v-if="placement.continuesBefore"
          data-annotation-continued
          class="pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 bg-white leading-none"
          title="Sustain pedal held from the previous line"
          >←</span
        >
        <span
          v-if="placement.continuesAfter"
          data-annotation-continues
          class="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 bg-white leading-none"
          title="Keep holding the sustain pedal on the next line"
          >→</span
        >
      </div>
    </div>
  </div>
</template>
