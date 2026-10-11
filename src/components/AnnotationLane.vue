<script setup lang="ts">
import { computed, onMounted, shallowRef, useTemplateRef } from 'vue';
import { annotationPlacements, type DisplayAnnotation } from '../annotations';
import type { Annotation } from '../music';
import type { ScoreLine } from '../layout';
import type { TimeLine } from '../selection';

const props = defineProps<{
  items: DisplayAnnotation[];
  line: ScoreLine;
  geometry?: TimeLine;
  rem: number;
}>();
const hovered = defineModel<Annotation | null>('hovered', { default: null });
const lane = useTemplateRef<HTMLElement>('lane');
const textContext = shallowRef<CanvasRenderingContext2D | null>(null);
let fontFamily = 'system-ui';
onMounted(() => {
  if (lane.value) fontFamily = getComputedStyle(lane.value).fontFamily;
  textContext.value = document.createElement('canvas').getContext('2d');
});
const placements = computed(() => {
  let left = 0;
  const bars =
    props.geometry?.bars ??
    props.line.bars.map((bar) => {
      const result = { ...bar, left, right: left + bar.preferred };
      left += bar.preferred;
      return result;
    });
  return annotationPlacements(
    props.items,
    props.line.from,
    props.line.to,
    bars,
    (item, continued) => {
      const size = props.rem * 0.75;
      const context = textContext.value;
      const parts = [
        { text: item.text, weight: item.kind === 'chord' ? 700 : 400 },
        { text: !continued && item.timing ? ` · ${item.timing}` : '', weight: 400 },
      ];
      const width = parts.reduce((sum, part) => {
        if (context) {
          context.font = `${part.weight} ${size}px ${fontFamily}`;
          return sum + context.measureText(part.text).width;
        }
        return (
          sum +
          Array.from(part.text).reduce(
            (total, character) => total + (character.charCodeAt(0) > 255 ? 1 : 0.55),
            0,
          ) *
            size
        );
      }, 0);
      return width + props.rem * (item.len || item.kind === 'timing' ? 1 : 0.5);
    },
  );
});
</script>

<template>
  <div
    v-if="placements.length"
    ref="lane"
    data-label-obstacle
    data-annotation-lane
    class="relative grid min-w-0 grid-cols-1 items-start gap-1 text-xs leading-4 text-slate-600"
  >
    <div
      v-for="(placement, index) in placements"
      :key="index"
      :data-annotation-kind="placement.item.kind"
      :data-annotation-start="placement.item.at"
      :data-annotation-row="placement.row"
      :data-annotation-interval="placement.item.len ? '' : undefined"
      :data-annotation-continued="placement.continuesBefore ? '' : undefined"
      :data-annotation-continues="placement.continuesAfter ? '' : undefined"
      :data-annotation-highlighted="hovered === placement.item ? '' : undefined"
      class="relative min-w-0 self-center"
      :class="[
        placement.item.kind === 'chord' ? 'text-slate-900' : '',
        placement.item.kind === 'timing'
          ? [
              'rounded-xl px-2',
              hovered === placement.item ? 'bg-slate-300 text-slate-900' : 'bg-slate-200',
            ]
          : placement.item.len
            ? [
                'mx-[2px] px-2',
                placement.continuesBefore ? '' : 'rounded-l-xl',
                placement.continuesAfter ? '' : 'rounded-r-xl',
                hovered === placement.item ? 'bg-slate-200 text-slate-900' : 'bg-slate-100',
              ]
            : { 'bg-slate-100 text-slate-900': hovered === placement.item },
      ]"
      :style="{
        gridColumn: '1',
        gridRow: placement.row,
        left: `${placement.left}px`,
        width: `${placement.item.len ? Math.max(0, placement.width - 4) : placement.width}px`,
        overflowWrap: 'anywhere',
      }"
      :title="placement.item.text"
      @pointerenter="hovered = placement.item"
      @pointerleave="hovered = null"
    >
      <p class="min-w-0" :class="{ 'whitespace-nowrap': placement.item.kind === 'timing' }">
        <span :class="{ 'font-bold': placement.item.kind === 'chord' }">{{
          placement.item.text
        }}</span>
        <span
          v-if="placement.item.timing && !placement.continuesBefore"
          data-annotation-kind="timing"
          :data-annotation-start="placement.item.at"
          class="font-normal whitespace-nowrap text-slate-600"
        >
          · {{ placement.item.timing }}
        </span>
      </p>
    </div>
  </div>
</template>
