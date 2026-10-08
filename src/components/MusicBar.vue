<script setup lang="ts">
import type { PitchLabelLayout } from '../geometry';
import {
  barPosition,
  notePlacement,
  timePlacement,
  type ScoreBar,
  type ScoreLine,
} from '../layout';
import { pitchLabel, type Note } from '../music';

const props = defineProps<{
  bar: ScoreBar;
  line: ScoreLine;
  ppq: number;
  selected: Set<number>;
  range: { from: number; to: number } | null;
  playhead: number | undefined;
  labels: Record<number, PitchLabelLayout>;
}>();
const emit = defineEmits<{ select: [index: number, event: MouseEvent]; clear: [] }>();

function hasLabel(note: Note) {
  return note.at >= props.bar.from || props.bar.from === props.line.from;
}
</script>

<template>
  <div
    data-score-bar
    class="relative grid min-w-0"
    :style="{
      flexBasis: `${bar.preferred}px`,
      flexGrow: bar.preferred,
      flexShrink: 1,
      minWidth: `${bar.minimum}px`,
      gridTemplateColumns: 'minmax(0, 1fr)',
      gridTemplateRows: `repeat(${line.rows.length}, 0.5rem)`,
    }"
    @click.self="emit('clear')"
  >
    <template v-for="band in line.bands" :key="band.from">
      <span
        class="pointer-events-none bg-slate-200"
        :style="{ gridRow: `${band.from} / ${band.to}`, gridColumn: '1 / -1' }"
      ></span>
      <span
        v-if="range && range.from < bar.to && range.to > bar.from"
        data-time-range
        class="pointer-events-none relative border-teal-500 bg-teal-700/5"
        :class="{
          'border-l': range.from >= bar.from || bar.from === line.from,
          'border-r': range.to <= bar.to || bar.to === line.to,
        }"
        :style="{
          gridRow: `${band.from} / ${band.to}`,
          gridColumn: '1 / -1',
          ...timePlacement(range.from, range.to, bar),
        }"
      ></span>
      <span
        v-for="beat in bar.beats"
        :key="beat.from"
        class="pointer-events-none relative"
        :class="[
          { 'border-l': beat.from > line.from },
          beat.number === 1 ? 'border-white' : 'border-slate-100',
        ]"
        :style="{
          gridRow: `${band.from} / ${band.to}`,
          gridColumn: '1 / -1',
          ...timePlacement(beat.from, beat.to, bar),
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
    <template v-for="(row, index) in line.rows" :key="index">
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
      v-if="playhead !== undefined"
      data-playhead
      class="pointer-events-none absolute inset-y-0 z-20 w-px bg-teal-600"
      :style="{ left: `min(${barPosition(playhead, bar) * 100}%, calc(100% - 1px))` }"
    ></span>
    <button
      v-for="{ note, index } in bar.notes"
      :key="index"
      class="relative z-10 h-1 min-w-0 cursor-pointer self-center text-left font-medium enabled:hover:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      :class="[
        selected.has(index) ? 'bg-teal-700 text-teal-700' : 'bg-slate-700 text-slate-700',
        {
          'rounded-l-sm': hasLabel(note),
          'rounded-r-sm': note.at + note.len <= bar.to || bar.to === line.to,
        },
      ]"
      :data-note-index="index"
      :tabindex="hasLabel(note) ? 0 : -1"
      :style="notePlacement(note, line, bar)"
      :title="`${pitchLabel(note.pitch)} · ${note.len / ppq} beats`"
      @click="emit('select', index, $event)"
    >
      <template v-if="hasLabel(note)">
        <span
          v-if="labels[index]"
          class="pointer-events-none absolute w-px bg-current opacity-40"
          :style="{
            left: `${labels[index]!.connector.left}px`,
            top: `${labels[index]!.connector.top}px`,
            height: `${labels[index]!.connector.height}px`,
          }"
        ></span>
        <span
          data-pitch-label
          class="absolute -top-4 left-0 px-0.5 text-xs leading-4 whitespace-nowrap"
          :style="
            labels[index] && {
              left: `${labels[index]!.label.left}px`,
              top: `${labels[index]!.label.top}px`,
            }
          "
        >
          <span v-if="note.at < line.from">←</span>
          {{ pitchLabel(note.pitch) }}
          <span v-if="note.at + note.len > line.to">→</span>
        </span>
      </template>
    </button>
  </div>
</template>
