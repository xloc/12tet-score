<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { candidateSlots } from '../candidate-slots';
import {
  compareMatches,
  followingWindow,
  matchStats,
  minimumMatches,
  moveMargin,
  type MatchMode,
  type MatchEvidence,
  type MatchResult,
} from '../following';
import { pitchLabel } from '../music';
import type { BarTiming } from '../timing';

const props = defineProps<{
  result: MatchResult | null;
  pitches: number[];
  bars: BarTiming[];
  focusBar: number;
}>();

const sourceBar = computed(
  () =>
    props.result?.candidates.find(
      (candidate) => candidate.mode === 'continue' || candidate.mode === 'restart',
    )?.bar ??
    (props.result?.candidates.find((candidate) => candidate.mode === 'next')?.bar ??
      props.focusBar + 1) - 1,
);
const globalCandidates = computed(() =>
  (props.result?.candidates ?? [])
    .filter((candidate) => candidate.mode === 'jump')
    .sort(compareMatches),
);
const globalSlots = ref<(number | undefined)[]>([undefined, undefined, undefined]);
watch(
  globalCandidates,
  (candidates) => {
    globalSlots.value = candidateSlots(
      globalSlots.value,
      candidates.map((candidate) => candidate.bar),
    );
  },
  { immediate: true },
);
const inputs = computed(() =>
  Array.from({ length: followingWindow }, (_, index) => props.pitches.at(index - followingWindow)),
);
const rows = computed(() => {
  const local: { id: string; label: string; mode: MatchMode; bar: number }[] = [
    { id: 'continue', label: 'Continue', mode: 'continue', bar: sourceBar.value },
    { id: 'restart', label: 'Retry', mode: 'restart', bar: sourceBar.value },
    { id: 'previous-1', label: 'Back 1 bar', mode: 'previous', bar: sourceBar.value - 1 },
    { id: 'previous-2', label: 'Back 2 bars', mode: 'previous', bar: sourceBar.value - 2 },
    { id: 'next', label: 'Next', mode: 'next', bar: sourceBar.value + 1 },
  ];
  const candidates = [
    ...local.map((row) => ({
      ...row,
      candidate: props.result?.candidates.find(
        (candidate) => candidate.mode === row.mode && candidate.bar === row.bar,
      ),
    })),
    ...globalSlots.value.map((bar, index) => ({
      id: `jump-${index}`,
      label: 'Whole score',
      mode: 'jump' as const,
      candidate: globalCandidates.value.find((candidate) => candidate.bar === bar),
    })),
  ];
  return candidates.map((row) => ({
    ...row,
    best: !!row.candidate && row.candidate === props.result?.candidates[0],
    stats: row.candidate ? matchStats(row.candidate) : undefined,
    cells: inputs.value.map((pitch, index) =>
      pitch === undefined
        ? undefined
        : row.candidate?.evidence[row.candidate.evidence.length - followingWindow + index],
    ),
  }));
});
const next = computed(() =>
  props.result?.candidates.find((candidate) => candidate.mode === 'next'),
);
const nextBar = computed(
  () => props.bars.find((bar) => bar.number === sourceBar.value + 1)?.number,
);
const matches = computed(
  () => next.value?.evidence.filter((item) => item.kind === 'match').length ?? 0,
);
const lead = computed(() =>
  next.value
    ? Math.min(
        ...(props.result?.candidates ?? [])
          .filter((candidate) => candidate.mode !== 'jump' && candidate.bar !== next.value!.bar)
          .map((candidate) => candidate.cost),
      ) - next.value.cost
    : 0,
);
const gates = computed(() => [
  {
    label: `Matches ${matches.value}/${minimumMatches}`,
    met: matches.value >= minimumMatches,
  },
  {
    label: Number.isFinite(lead.value)
      ? `Lead ${lead.value.toFixed(1)}/${moveMargin}`
      : 'No competing match',
    met: lead.value >= moveMargin,
  },
  {
    label: 'Latest note matches',
    met: next.value?.evidence.at(-1)?.kind === 'match',
  },
]);
const columns = `6rem 2.25rem 2.5rem repeat(${followingWindow}, minmax(1.75rem, 1fr))`;

function evidenceTitle(evidence: MatchEvidence | undefined) {
  if (!evidence) return 'Before this interpretation began.';
  const bar = props.bars.find((bar) => evidence.at >= bar.from && evidence.at < bar.to);
  const position = bar
    ? `bar ${bar.number}, beat ${Number((1 + (evidence.at - bar.from) / bar.beatTicks).toFixed(2))}`
    : '';
  const omitted = evidence.missed.length
    ? ` Omitted: ${evidence.missed.map(pitchLabel).join(', ')}.`
    : '';
  return `${pitchLabel(evidence.pitch)}: ${evidence.kind === 'match' ? 'matched' : 'extra'} at ${position}.${omitted}`;
}
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col gap-2" data-matching-alignment>
    <div class="-mx-3 min-h-0 overflow-auto">
      <div
        class="grid min-w-[33.5rem] px-3 text-xs"
        :style="{ gridTemplateColumns: columns }"
        data-candidate-table
      >
        <div
          class="col-span-full grid h-8 grid-cols-subgrid grid-rows-2 text-[10px] leading-4 text-slate-500"
        >
          <span class="row-span-2 flex items-center">Candidate</span>
          <span class="row-span-2 flex items-center">Bar</span>
          <span
            class="row-span-2 flex items-center justify-center"
            title="Note agreement: matched ÷ (matched + extra + omitted)."
            >Match</span
          >
          <span :style="{ gridColumn: `span ${followingWindow}` }" class="text-center"
            >Recent notes →</span
          >
          <span
            v-for="(pitch, index) in inputs"
            :key="index"
            class="min-w-0 truncate text-center"
            :title="pitch === undefined ? undefined : pitchLabel(pitch)"
            >{{ pitch === undefined ? '' : pitchLabel(pitch) }}</span
          >
        </div>
        <div
          v-for="row in rows"
          :key="row.id"
          class="relative isolate col-span-full grid h-6 grid-cols-subgrid items-center"
          :class="
            row.best
              ? 'text-slate-900 before:pointer-events-none before:absolute before:-inset-x-3 before:inset-y-0 before:-z-10 before:bg-slate-50'
              : 'text-slate-600'
          "
          :data-candidate-slot="row.id"
          :data-candidate-mode="row.mode"
          :data-candidate-bar="row.candidate?.bar"
          :data-best-candidate="row.best || undefined"
        >
          <span
            class="min-w-0 truncate"
            :class="{ 'font-medium': row.best }"
            :title="
              row.candidate
                ? `${row.label} · Bar ${row.candidate.bar}. Cost ${row.candidate.cost.toFixed(1)}.`
                : 'No matching evidence yet.'
            "
            >{{ row.label }}</span
          >
          <span class="tabular-nums">{{ row.candidate?.bar ?? '—' }}</span>
          <svg
            v-if="row.stats"
            class="block w-full px-1"
            height="8"
            viewBox="0 0 100 8"
            preserveAspectRatio="none"
            :data-candidate-score="row.stats.score"
          >
            <title>
              {{
                `Note agreement ${Math.round(row.stats.score * 100)}%. ${row.stats.matches} matched, ${row.stats.extra} extra, ${row.stats.missed} omitted.`
              }}
            </title>
            <rect y="2" width="100" height="4" fill="currentColor" fill-opacity="0.12" />
            <rect y="2" :width="row.stats.score * 100" height="4" fill="currentColor" />
          </svg>
          <span v-else class="text-center text-slate-400">—</span>
          <span
            v-for="(cell, index) in row.cells"
            :key="index"
            class="flex items-center justify-center"
          >
            <svg
              width="16"
              height="24"
              viewBox="0 0 16 24"
              :data-match-kind="
                inputs[index] === undefined || !row.candidate ? 'empty' : (cell?.kind ?? 'unused')
              "
              :data-evidence-mode="row.mode"
              :data-input-index="index"
              :data-missed-count="cell?.missed.length || undefined"
            >
              <template v-if="inputs[index] !== undefined && row.candidate">
                <title>{{ evidenceTitle(cell) }}</title>
                <path
                  v-if="cell?.kind === 'match' && cell.missed.length"
                  d="M 8 7 L 13 12 L 8 17 L 3 12 Z"
                  fill="currentColor"
                />
                <circle
                  v-else-if="cell?.kind === 'match'"
                  cx="8"
                  cy="12"
                  r="4"
                  fill="currentColor"
                />
                <path
                  v-else-if="cell"
                  d="M 4 8 L 12 16 M 12 8 L 4 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
                <line
                  v-else
                  x1="5"
                  x2="11"
                  y1="12"
                  y2="12"
                  stroke="currentColor"
                  stroke-opacity="0.3"
                />
              </template>
            </svg>
          </span>
        </div>
      </div>
    </div>
    <p class="h-8 shrink-0 text-[11px] leading-4 text-slate-500">
      <span
        class="block truncate"
        title="● Matched · ◆ Matched + omitted · × Extra · — Before this interpretation"
        >● Matched · ◆ Matched + omitted · × Extra · — Before this interpretation</span
      >
      <span class="block truncate">Shaded row: current matcher choice.</span>
    </p>
    <div class="h-8 shrink-0" :data-move-gates="nextBar ? '' : undefined">
      <p class="text-xs leading-4">
        {{
          nextBar ? `To enter bar ${nextBar}:` : bars.length ? 'End of score.' : 'No score loaded.'
        }}
      </p>
      <ul v-if="nextBar" class="grid grid-cols-3 gap-2 text-[11px] leading-4">
        <li
          v-for="gate in gates"
          :key="gate.label"
          class="flex min-w-0 items-center gap-1"
          :data-gate-met="gate.met"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" class="shrink-0">
            <circle
              cx="8"
              cy="8"
              r="4"
              stroke="currentColor"
              :fill="gate.met ? 'currentColor' : 'none'"
            />
          </svg>
          <span class="truncate" :title="gate.label">{{ gate.label }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
