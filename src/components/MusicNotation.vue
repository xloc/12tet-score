<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
import { useDragSelection, type SelectionDrag } from '../composables/useDragSelection';
import { notePlacement, pitchLabel, type Note } from '../music';
import {
  boxHits,
  notesSelection,
  selectedIndices,
  selectionBox,
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

const surface = useTemplateRef<HTMLDivElement>('surface');
const pitchHeader = useTemplateRef<HTMLSpanElement>('pitchHeader');
const selected = computed(() => new Set(selectedIndices(props.notes, props.selection)));

const beatWidth = 8;
const beatCount = computed(() => props.totalTicks / props.ppq);
const beatsPerBar = computed(() => props.ticksPerBar / props.ppq);
const highestPitch = computed(() => Math.max(...props.notes.map((note) => note.pitch)));
const lowestPitch = computed(() => Math.min(...props.notes.map((note) => note.pitch)));
const pitches = computed(() =>
  Array.from(
    { length: highestPitch.value - lowestPitch.value + 1 },
    (_, index) => highestPitch.value - index,
  ),
);

function pointFromEvent(event: PointerEvent): Point {
  const bounds = surface.value!.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function tickAt(point: Point) {
  const axisWidth = pitchHeader.value!.offsetWidth;
  const fraction = (point.x - axisWidth) / (surface.value!.offsetWidth - axisWidth);
  const cell = props.ppq / 4;
  return Math.max(
    0,
    Math.min(props.totalTicks, Math.round((fraction * props.totalTicks) / cell) * cell),
  );
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
  const indices = Array.from(
    surface.value!.querySelectorAll<HTMLButtonElement>('[data-note-index]'),
  ).flatMap((element) => {
    const bounds = element.getBoundingClientRect();
    return boxHits(box, {
      left: bounds.left - origin.left,
      right: bounds.right - origin.left,
      top: bounds.top - origin.top,
      bottom: bounds.bottom - origin.top,
    })
      ? [Number(element.dataset.noteIndex)]
      : [];
  });
  emit(
    'select',
    notesSelection(props.notes, props.selection, indices, drag.additive ? 'add' : 'replace'),
  );
}

const { drag, start, move, end, cancel, suppressClick } = useDragSelection(
  pointFromEvent,
  commitDrag,
);
const box = computed(() => (drag.value ? selectionBox(drag.value.start, drag.value.end) : null));

function startSelection(event: PointerEvent) {
  const target = event.target as HTMLElement;
  if (target.closest('[data-pitch-label]')) return;
  start(event, target.closest('[data-time-header]') ? 'range' : 'box');
}

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
  <div class="min-h-0 overflow-auto">
    <div
      ref="surface"
      class="relative grid w-max touch-pinch-zoom select-none"
      :style="{
        gridTemplateColumns: `4rem repeat(${beatCount * 4}, ${beatWidth / 4}rem)`,
        gridTemplateRows: `2rem repeat(${pitches.length}, 1.5rem)`,
      }"
      @pointerdown="startSelection"
      @pointermove="move"
      @pointerup="end"
      @pointercancel="cancel"
      @lostpointercapture="cancel"
      @click.capture="suppressClick"
      @click.self="clearSelection"
      @keydown.esc="clearSelection"
    >
      <span
        v-if="selection.kind === 'range'"
        class="pointer-events-none border-x border-teal-500 bg-teal-700/5"
        :style="{
          gridRow: '2 / -1',
          gridColumn: `${2 + selection.from / (ppq / 4)} / ${2 + selection.to / (ppq / 4)}`,
        }"
      ></span>
      <span
        v-for="beat in beatCount"
        :key="`guide-${beat}`"
        class="pointer-events-none"
        :class="[
          { 'border-l': beat > 1 },
          (beat - 1) % beatsPerBar === 0 ? 'border-slate-200' : 'border-slate-100',
        ]"
        :style="{ gridRow: '2 / -1', gridColumn: `${2 + (beat - 1) * 4} / span 4` }"
      ></span>
      <span
        v-for="(_, index) in pitches"
        :key="`row-${index}`"
        class="pointer-events-none border-b border-slate-100"
        :style="{ gridRow: index + 2, gridColumn: '2 / -1' }"
      ></span>
      <span
        ref="pitchHeader"
        data-pitch-label
        class="sticky top-0 left-0 z-30 flex items-center border-r border-b border-slate-200 bg-white px-2 text-xs text-slate-500"
        :style="{ gridRow: 1, gridColumn: 1 }"
      >
        Pitch
      </span>
      <span
        v-for="beat in beatCount"
        :key="`beat-${beat}`"
        data-time-header
        class="sticky top-0 z-20 flex cursor-crosshair items-center border-b border-slate-200 bg-white px-2 text-xs text-slate-500 tabular-nums"
        :style="{ gridRow: 1, gridColumn: `${2 + (beat - 1) * 4} / span 4` }"
        title="Drag to select a time range"
      >
        <span v-if="(beat - 1) % beatsPerBar === 0">
          Measure
          <span class="font-medium text-slate-700">{{
            1 + Math.floor((beat - 1) / beatsPerBar)
          }}</span>
        </span>
        <span v-else>{{ ((beat - 1) % beatsPerBar) + 1 }}</span>
      </span>
      <span
        v-for="(pitch, index) in pitches"
        :key="pitch"
        data-pitch-label
        class="sticky left-0 z-10 flex items-center border-r border-slate-200 bg-white px-2 text-xs text-slate-500 tabular-nums"
        :style="{ gridRow: index + 2, gridColumn: 1 }"
      >
        {{ pitchLabel(pitch) }}
      </span>
      <button
        v-for="(note, index) in notes"
        :key="`${note.voice}-${note.at}-${note.pitch}`"
        class="h-5 min-w-0 cursor-pointer self-center overflow-hidden rounded-sm px-0.5 text-left text-xs font-medium text-white enabled:hover:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        :class="selected.has(index) ? 'bg-teal-700' : 'bg-slate-700'"
        :data-note-index="index"
        :style="notePlacement(note, 0, totalTicks, highestPitch, ppq)"
        :title="`${pitchLabel(note.pitch)} · ${note.len / ppq} beats`"
        @click="selectNote(index, $event)"
      >
        {{ pitchLabel(note.pitch) }}
      </button>
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
          top: drag.scope === 'range' ? '0' : `${box.top}px`,
          width: `${box.right - box.left}px`,
          height: drag.scope === 'range' ? '100%' : `${box.bottom - box.top}px`,
        }"
      >
        <span
          class="absolute bottom-full left-0 bg-white px-1 text-xs whitespace-nowrap text-slate-600"
        >
          {{ drag.scope === 'range' ? 'Time range' : box.mode === 'contain' ? 'Contain' : 'Touch' }}
        </span>
      </div>
    </div>
  </div>
</template>
