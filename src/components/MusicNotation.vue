<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import { useDragSelection, type SelectionDrag } from '../composables/useDragSelection';
import { notePlacement, pitchLabel, scoreLines, type Note } from '../music';
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
  selection: MusicSelection;
}>();
const emit = defineEmits<{ select: [selection: MusicSelection] }>();

const viewport = useTemplateRef<HTMLDivElement>('viewport');
const surface = useTemplateRef<HTMLDivElement>('surface');
const selected = computed(() => new Set(selectedIndices(props.notes, props.selection)));

const beatWidth = 8;
const barsPerLine = ref(1);
const beatsPerBar = computed(() => props.ticksPerBar / props.ppq);
const lines = computed(() =>
  scoreLines(props.notes, props.totalTicks, props.ticksPerBar, barsPerLine.value),
);
let observer: ResizeObserver | undefined;

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    barsPerLine.value = Math.max(
      1,
      Math.floor(entry!.contentRect.width / (beatsPerBar.value * beatWidth * rem)),
    );
    cancel();
  });
  observer.observe(viewport.value!);
});

onBeforeUnmount(() => observer?.disconnect());

function pointFromEvent(event: PointerEvent): Point {
  const bounds = surface.value!.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function tickAt(point: Point) {
  const origin = surface.value!.getBoundingClientRect();
  const bounds = Array.from(
    surface.value!.querySelectorAll<HTMLDivElement>('[data-score-line]'),
  ).map((element, index) => {
    const rect = element.getBoundingClientRect();
    const line = lines.value[index]!;
    return {
      left: rect.left - origin.left,
      top: rect.top - origin.top,
      right: rect.right - origin.left,
      bottom: rect.bottom - origin.top,
      from: line.from,
      to: line.to,
    };
  });
  return tickAtPoint(point, bounds, props.ppq);
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
  const origin = surface.value!.getBoundingClientRect();
  const indices = new Set<number>();
  for (const element of surface.value!.querySelectorAll<HTMLButtonElement>('[data-note-index]')) {
    const bounds = element.getBoundingClientRect();
    if (
      boxHits(box, {
        left: bounds.left - origin.left,
        right: bounds.right - origin.left,
        top: bounds.top - origin.top,
        bottom: bounds.bottom - origin.top,
      })
    ) {
      indices.add(Number(element.dataset.noteIndex));
    }
  }
  emit(
    'select',
    notesSelection(props.notes, props.selection, [...indices], drag.additive ? 'add' : 'replace'),
  );
}

const { drag, start, move, end, cancel, suppressClick } = useDragSelection(
  pointFromEvent,
  commitDrag,
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
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    ('pointerType' in event && event.pointerType === 'touch');
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
  <div ref="viewport" class="min-h-0 overflow-auto">
    <div
      ref="surface"
      class="relative grid w-full touch-pan-y touch-pinch-zoom gap-y-4 select-none"
      title="Drag to select notes; Alt/Option-drag to select a time range"
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
        class="relative grid min-w-0 bg-slate-50"
        :style="{
          width: `${((line.to - line.from) / (barsPerLine * ticksPerBar)) * 100}%`,
          gridTemplateColumns: `repeat(${(line.to - line.from) / (ppq / 4)}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${line.highestPitch - line.lowestPitch + 1}, 1rem)`,
        }"
        @click.self="clearSelection"
      >
        <span
          v-if="range && range.from < line.to && range.to > line.from"
          class="pointer-events-none border-x border-teal-500 bg-teal-700/5"
          :style="{
            gridRow: '1 / -1',
            gridColumn: `${1 + (Math.max(range.from, line.from) - line.from) / (ppq / 4)} / ${1 + (Math.min(range.to, line.to) - line.from) / (ppq / 4)}`,
          }"
        ></span>
        <span
          v-for="beat in (line.to - line.from) / ppq"
          :key="`guide-${beat}`"
          class="pointer-events-none overflow-hidden"
          :class="[
            { 'border-l': beat > 1 },
            (beat - 1) % beatsPerBar === 0 ? 'border-slate-200' : 'border-slate-100',
          ]"
          :style="{ gridRow: '1 / -1', gridColumn: `${1 + (beat - 1) * 4} / span 4` }"
        >
          <span
            class="block h-4 overflow-hidden px-1 text-[10px] leading-4 tabular-nums"
            :class="(beat - 1) % beatsPerBar === 0 ? 'text-slate-400' : 'text-slate-300'"
          >
            <template v-if="(beat - 1) % beatsPerBar === 0">
              Measure {{ 1 + line.from / ticksPerBar + Math.floor((beat - 1) / beatsPerBar) }}
            </template>
            <template v-else>{{ ((beat - 1) % beatsPerBar) + 1 }}</template>
          </span>
        </span>
        <span
          v-for="row in line.highestPitch - line.lowestPitch + 1"
          :key="`row-${row}`"
          class="pointer-events-none border-b border-slate-100"
          :style="{ gridRow: row, gridColumn: '1 / -1' }"
        ></span>
        <button
          v-for="{ note, index } in line.notes"
          :key="index"
          class="relative z-10 h-4 min-w-0 cursor-pointer self-center overflow-hidden rounded-sm px-0.5 text-left text-xs font-medium text-white enabled:hover:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          :class="selected.has(index) ? 'bg-teal-700' : 'bg-slate-700'"
          :data-note-index="index"
          :style="notePlacement(note, line.from, line.to, line.highestPitch, ppq)"
          :title="`${pitchLabel(note.pitch)} · ${note.len / ppq} beats`"
          @click="selectNote(index, $event)"
        >
          <span v-if="note.at < line.from">←</span>
          {{ pitchLabel(note.pitch) }}
          <span v-if="note.at + note.len > line.to">→</span>
        </button>
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
