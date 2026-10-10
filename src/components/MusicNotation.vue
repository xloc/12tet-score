<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { useDragSelection, type SelectionDrag } from '../composables/useDragSelection';
import MusicBar from './MusicBar.vue';
import { layoutPitchLabels, measureNotes, measureTimeLines } from '../geometry';
import { scoreLines } from '../layout';
import type { Note } from '../music';
import {
  boxHits,
  notesSelection,
  selectedIndices,
  selectionBox,
  tickAtPoint,
  type MusicSelection,
  type Point,
} from '../selection';

const props = defineProps<{
  notes: Note[];
  totalTicks: number;
  ppq: number;
  ticksPerBar: number;
  foldThreshold: number;
  variableBarWidth: boolean;
  playhead: number;
  playing: boolean;
  selection: MusicSelection;
}>();
const emit = defineEmits<{ select: [selection: MusicSelection]; seek: [tick: number] }>();

const viewport = useTemplateRef<HTMLDivElement>('viewport');
const surface = useTemplateRef<HTMLDivElement>('surface');
const selected = computed(() => new Set(selectedIndices(props.notes, props.selection)));

const availableWidth = ref(0);
const rem = ref(16);
const lines = computed(() =>
  scoreLines(props.notes, props.totalTicks, {
    ppq: props.ppq,
    ticksPerBar: props.ticksPerBar,
    width: availableWidth.value,
    rem: rem.value,
    foldThreshold: props.foldThreshold,
    variableBarWidth: props.variableBarWidth,
  }),
);
const playheadLine = computed(
  () =>
    lines.value.find((line) => props.playhead >= line.from && props.playhead < line.to) ??
    lines.value.at(-1),
);
const playheadBar = computed(
  () =>
    playheadLine.value?.bars.find((bar) => props.playhead < bar.to) ??
    playheadLine.value?.bars.at(-1),
);
const labelLayouts = ref<ReturnType<typeof layoutPitchLabels>>({});
let observer: ResizeObserver | undefined;

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    rem.value = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    availableWidth.value = entry!.contentRect.width;
    cancel();
  });
  observer.observe(viewport.value!);
  layoutLabels();
});

onBeforeUnmount(() => observer?.disconnect());

watch(
  () => props.notes,
  () => {
    cancel();
    viewport.value?.scrollTo({ top: 0, left: 0 });
  },
);
watch(
  lines,
  () => {
    cancel();
    layoutLabels();
  },
  { flush: 'post' },
);
watch(
  [playheadLine, () => props.playing],
  () => {
    if (props.playing) {
      scrollToPlayhead();
    }
  },
  { flush: 'post' },
);

function scrollToPlayhead() {
  surface.value
    ?.querySelector<HTMLElement>('[data-playhead]')
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

defineExpose({ scrollToPlayhead });

function layoutLabels() {
  labelLayouts.value = layoutPitchLabels(surface.value!, lines.value);
  if (props.playing) scrollToPlayhead();
}

function pointFromEvent(event: PointerEvent): Point {
  const bounds = surface.value!.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function tickAt(point: Point) {
  return tickAtPoint(point, measureTimeLines(surface.value!, lines.value), props.ppq);
}

function movePlayhead(event: PointerEvent) {
  const point = pointFromEvent(event);
  const line = (event.target as Element).closest<HTMLElement>('[data-score-line]');
  if (line) {
    point.y = line.getBoundingClientRect().top - surface.value!.getBoundingClientRect().top;
  }
  emit('seek', tickAt(point));
}

function commitDrag(drag: SelectionDrag) {
  if (drag.scope === 'range') {
    const start = tickAt(drag.start);
    const end = tickAt(drag.end);
    if (start !== end) {
      emit('select', { kind: 'range', from: Math.min(start, end), to: Math.max(start, end) });
    }
    return;
  }
  const box = selectionBox(drag.start, drag.end);
  const indices = new Set<number>();
  for (const { index, bar } of measureNotes(surface.value!, lines.value)) {
    if (boxHits(box, bar)) indices.add(index);
  }
  emit(
    'select',
    notesSelection(props.notes, props.selection, [...indices], drag.additive ? 'add' : 'replace'),
  );
}

const { drag, start, move, end, cancel, suppressClick } = useDragSelection(
  pointFromEvent,
  commitDrag,
  movePlayhead,
);
const box = computed(() =>
  drag.value?.scope === 'box' ? selectionBox(drag.value.start, drag.value.end) : null,
);
const range = computed(() => {
  if (drag.value?.scope === 'range') {
    const start = tickAt(drag.value.start);
    const end = tickAt(drag.value.end);
    return { from: Math.min(start, end), to: Math.max(start, end) };
  }
  return props.selection.kind === 'range' ? props.selection : null;
});

function selectNote(index: number, event: MouseEvent) {
  const toggle =
    event.ctrlKey || event.shiftKey || ('pointerType' in event && event.pointerType === 'touch');
  emit(
    'select',
    notesSelection(props.notes, props.selection, [index], toggle ? 'toggle' : 'replace'),
  );
}

function clearSelection() {
  cancel();
  emit('select', { kind: 'notes', indices: [] });
}
</script>

<template>
  <div ref="viewport" class="min-h-0 scroll-pb-32 overflow-auto">
    <div
      ref="surface"
      class="relative grid w-full grid-cols-1 touch-pan-y touch-pinch-zoom gap-y-12 pt-4 pb-32 select-none"
      title="Command-click to move the playhead; drag to select notes; Alt/Option-drag to select a time range"
      @pointerdown="start"
      @pointermove="move"
      @pointerup="end"
      @pointercancel="cancel"
      @lostpointercapture="cancel"
      @click.capture="suppressClick"
      @click.self="clearSelection"
      @keydown.esc="clearSelection"
    >
      <div
        v-for="line in lines"
        :key="line.from"
        data-score-line
        class="relative flex w-full"
        :style="{
          minWidth: `${line.minimum}px`,
          maxWidth: line.maximum === undefined ? undefined : `${line.maximum}px`,
        }"
        @click.self="clearSelection"
      >
        <MusicBar
          v-for="bar in line.bars"
          :key="bar.from"
          :bar="bar"
          :line="line"
          :ppq="ppq"
          :selected="selected"
          :range="range"
          :playhead="line === playheadLine && bar === playheadBar ? playhead : undefined"
          :labels="labelLayouts[line.from] ?? {}"
          @select="selectNote"
          @clear="clearSelection"
        />
      </div>
      <div
        v-if="box && drag"
        class="pointer-events-none absolute z-20 border-2"
        :class="
          box.mode === 'contain'
            ? 'border-teal-600 bg-teal-600/10'
            : 'border-dashed border-sky-600 bg-sky-600/10'
        "
        :style="{
          left: `${box.left}px`,
          top: `${box.top}px`,
          width: `${box.right - box.left}px`,
          height: `${box.bottom - box.top}px`,
        }"
      >
        <span
          class="absolute bottom-full left-0 bg-white px-1 text-xs whitespace-nowrap text-slate-600"
        >
          {{ box.mode === 'contain' ? 'Contain' : 'Touch' }}
        </span>
      </div>
    </div>
  </div>
</template>
