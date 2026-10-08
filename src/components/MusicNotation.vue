<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
  type CSSProperties,
} from 'vue';
import { useDragSelection, type SelectionDrag } from '../composables/useDragSelection';
import { placePitchLabels } from '../labels';
import { measureScoreLine } from '../geometry';
import {
  notePlacement,
  pitchLabel,
  positionAtTick,
  scoreLines,
  timePlacement,
  type Note,
  type ScoreGeometry,
} from '../music';
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
const geometries = ref<Record<number, ScoreGeometry>>({});
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
const labelLayouts = ref<
  Record<number, Record<number, { label: CSSProperties; connector: CSSProperties }>>
>({});
let observer: ResizeObserver | undefined;

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    rem.value = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    availableWidth.value = entry!.contentRect.width;
    cancel();
  });
  observer.observe(viewport.value!);
  void layoutNotation();
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
    void layoutNotation();
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

async function layoutNotation() {
  geometries.value = Object.fromEntries(
    Array.from(surface.value!.querySelectorAll<HTMLElement>('[data-score-line]')).map(
      (element, index) => [lines.value[index]!.from, measureScoreLine(element)],
    ),
  );
  await nextTick();
  if (!surface.value) return;
  layoutLabels();
  if (props.playing) scrollToPlayhead();
}

function layoutLabels() {
  const layouts: typeof labelLayouts.value = {};
  const bounds = surface.value!.getBoundingClientRect();
  const notes = Array.from(
    surface.value!.querySelectorAll<HTMLDivElement>('[data-score-line]'),
  ).flatMap((element, lineIndex) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('[data-note-index]')).map((button) => {
      const bar = button.getBoundingClientRect();
      const label = button.querySelector<HTMLSpanElement>('[data-pitch-label]')!;
      return {
        lineFrom: lines.value[lineIndex]!.from,
        index: Number(button.dataset.noteIndex),
        bar: {
          left: bar.left - bounds.left,
          top: bar.top - bounds.top,
          right: bar.right - bounds.left,
          bottom: bar.bottom - bounds.top,
        },
        width: label.offsetWidth,
        height: label.offsetHeight,
      };
    }),
  );
  const obstacles = Array.from(
    surface.value!.querySelectorAll<HTMLElement>('[data-pitch-fold], [data-time-label]'),
  ).map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left - bounds.left,
      top: rect.top - bounds.top,
      right: rect.right - bounds.left,
      bottom: rect.bottom - bounds.top,
    };
  });
  const positions = placePitchLabels(
    notes,
    Math.max(bounds.width, surface.value!.scrollWidth),
    bounds.height,
    obstacles,
  );
  for (const [index, label] of positions.entries()) {
    const { bar, lineFrom, index: noteIndex } = notes[index]!;
    const above = label.bottom <= bar.top;
    const top = above ? label.bottom : bar.bottom;
    const bottom = above ? bar.top : label.top;
    layouts[lineFrom] ??= {};
    layouts[lineFrom]![noteIndex] = {
      label: { left: `${label.left - bar.left}px`, top: `${label.top - bar.top}px` },
      connector: {
        left: `${Math.max(bar.left, Math.min(bar.right, (label.left + label.right) / 2)) - bar.left}px`,
        top: `${top - bar.top}px`,
        height: `${Math.max(0, bottom - top)}px`,
      },
    };
  }
  labelLayouts.value = layouts;
}

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
      ...measureScoreLine(element),
    };
  });
  return tickAtPoint(point, bounds, props.ppq);
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
  <div ref="viewport" class="min-h-0 overflow-auto">
    <div
      ref="surface"
      class="relative grid w-full grid-cols-1 touch-pan-y touch-pinch-zoom gap-y-12 py-4 select-none"
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
        class="relative grid w-full"
        :style="{
          minWidth: `${line.minimum}px`,
          maxWidth: line.maximum === undefined ? undefined : `${line.maximum}px`,
          gridTemplateColumns: 'minmax(0, 1fr)',
          gridTemplateRows: `repeat(${line.rows.length}, 0.5rem)`,
        }"
        @click.self="clearSelection"
      >
        <div
          class="pointer-events-none flex min-w-0"
          :style="{ gridRow: '1 / -1', gridColumn: '1 / -1' }"
        >
          <span
            v-for="bar in line.bars"
            :key="bar.from"
            data-score-bar
            :data-bar-from="bar.from"
            :data-bar-to="bar.to"
            :style="{
              flexBasis: `${bar.preferred}px`,
              flexGrow: bar.preferred,
              flexShrink: 1,
              minWidth: `${bar.minimum}px`,
            }"
          ></span>
        </div>
        <template v-for="band in line.bands" :key="band.from">
          <span
            class="pointer-events-none bg-slate-200"
            :style="{ gridRow: `${band.from} / ${band.to}`, gridColumn: '1 / -1' }"
          ></span>
          <span
            v-if="range && range.from < line.to && range.to > line.from"
            v-show="geometries[line.from]"
            class="pointer-events-none relative border-x border-teal-500 bg-teal-700/5"
            :style="{
              gridRow: `${band.from} / ${band.to}`,
              gridColumn: '1 / -1',
              ...(geometries[line.from]
                ? timePlacement(range.from, range.to, geometries[line.from]!)
                : {}),
            }"
          ></span>
          <span
            v-for="beat in line.beats"
            :key="`guide-${beat.from}`"
            v-show="geometries[line.from]"
            class="pointer-events-none relative"
            :class="[
              { 'border-l': beat.from > line.from },
              beat.number === 1 ? 'border-white' : 'border-slate-100',
            ]"
            :style="{
              gridRow: `${band.from} / ${band.to}`,
              gridColumn: '1 / -1',
              ...(geometries[line.from]
                ? timePlacement(beat.from, beat.to, geometries[line.from]!)
                : {}),
            }"
          >
            <span
              v-if="band.from === 1"
              data-time-label
              class="absolute bottom-full left-0 h-4 px-1 text-[10px] leading-4 tabular-nums"
              :class="beat.number === 1 ? 'text-slate-400' : 'text-slate-300'"
            >
              {{ beat.number === 1 ? beat.bar : beat.number }}
            </span>
          </span>
        </template>
        <template v-for="(row, index) in line.rows" :key="`pitch-row-${index}`">
          <span
            v-if="typeof row === 'number' && row % 12 === 0"
            class="pointer-events-none h-px self-center bg-slate-100"
            :style="{ gridRow: index + 1, gridColumn: '1 / -1' }"
          ></span>
          <span
            v-else-if="typeof row !== 'number'"
            data-pitch-fold
            class="pointer-events-none"
            :style="{ gridRow: index + 1, gridColumn: '1 / -1' }"
          ></span>
        </template>
        <span
          v-if="line === playheadLine"
          v-show="geometries[line.from]"
          data-playhead
          class="pointer-events-none absolute inset-y-0 z-20 w-px bg-teal-600"
          :style="{
            left: geometries[line.from]
              ? `min(${(positionAtTick(playhead, geometries[line.from]!.bars) / geometries[line.from]!.width) * 100}%, calc(100% - 1px))`
              : undefined,
          }"
        ></span>
        <button
          v-for="{ note, index } in line.notes"
          :key="index"
          v-show="geometries[line.from]"
          class="relative z-10 h-1 min-w-0 cursor-pointer self-center rounded-sm text-left font-medium enabled:hover:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          :class="selected.has(index) ? 'bg-teal-700 text-teal-700' : 'bg-slate-700 text-slate-700'"
          :data-note-index="index"
          :style="notePlacement(note, line, geometries[line.from])"
          :title="`${pitchLabel(note.pitch)} · ${note.len / ppq} beats`"
          @click="selectNote(index, $event)"
        >
          <span
            v-if="labelLayouts[line.from]?.[index]"
            class="pointer-events-none absolute w-px bg-current opacity-40"
            :style="labelLayouts[line.from]![index]!.connector"
          ></span>
          <span
            data-pitch-label
            class="absolute -top-4 left-0 px-0.5 text-xs leading-4 whitespace-nowrap"
            :style="labelLayouts[line.from]?.[index]?.label"
          >
            <span v-if="note.at < line.from">←</span>
            {{ pitchLabel(note.pitch) }}
            <span v-if="note.at + note.len > line.to">→</span>
          </span>
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
