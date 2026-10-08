<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
import { Play, Settings, Square } from '@lucide/vue';
import { chordNames } from '../chords';
import { barCount, pitchLabel, score, ticksPerBar, totalTicks } from '../music';
import { usePlaybackStore } from '../stores/playback';
import { useScoreStore } from '../stores/score';
import ControlButton from './ControlButton.vue';
import InfoPanel from './InfoPanel.vue';

const sheet = useScoreStore();
const playback = usePlaybackStore();
const playbackSettings = useTemplateRef<HTMLDialogElement>('playbackSettings');
const infoSummary = computed(() => {
  if (sheet.selectedNotes.length === 1) return pitchLabel(sheet.selectedNotes[0]!.pitch);
  if (sheet.selectedNotes.length || sheet.selection.kind === 'range')
    return `${sheet.selectedNotes.length} notes`;
  return 'Whole piece';
});
const position = computed(() =>
  sheet.span
    ? `${Math.floor(sheet.span.from / ticksPerBar) + 1} · ${(sheet.span.from % ticksPerBar) / score.ppq + 1}`
    : '—',
);
const possibleChord = computed(() => chordNames(sheet.selectedNotes).join(' / ') || '—');
const infoFields = computed(() => {
  const tempo = { label: 'Tempo', value: `${playback.bpm} BPM` };
  const span = sheet.span;
  if (!span) {
    return [
      tempo,
      { label: 'Meter', value: score.meter.join('/') },
      { label: 'Length', value: `${barCount} measures` },
    ];
  }
  const singleNote = sheet.selectedNotes.length === 1;
  return [
    { label: 'Measure · beat', value: position.value },
    {
      label: singleNote && sheet.selection.kind === 'notes' ? 'Duration' : 'Time span',
      value: `${(span.to - span.from) / score.ppq} beats`,
    },
    singleNote ? tempo : { label: 'Possible chord', value: possibleChord.value },
  ];
});
</script>

<template>
  <aside
    class="grid max-h-[35dvh] overflow-auto border-t border-slate-200 bg-slate-50 sm:grid-cols-2"
  >
    <InfoPanel class="border-b sm:border-r sm:border-b-0">
      <div class="flex items-center gap-2">
        <ControlButton
          primary
          icon-only
          title="Play"
          :disabled="playback.playing"
          @click="playback.play(score.notes, 0, totalTicks)"
        >
          <Play :size="16" />
          <span class="sr-only">Play</span>
        </ControlButton>
        <ControlButton icon-only title="Stop" :disabled="!playback.playing" @click="playback.stop">
          <Square :size="16" />
          <span class="sr-only">Stop</span>
        </ControlButton>
        <ControlButton
          icon-only
          title="Settings"
          :disabled="playback.playing"
          @click="playbackSettings?.showModal()"
        >
          <Settings :size="16" />
          <span class="sr-only">Settings</span>
        </ControlButton>
      </div>
      <div class="space-y-1">
        <div class="font-medium text-slate-900 tabular-nums">
          {{ (playback.currentTick / score.ppq).toFixed(1) }}
          <span class="text-xs font-normal text-slate-500"
            >/ {{ totalTicks / score.ppq }} beats</span
          >
        </div>
        <progress
          class="block h-1.5 w-full accent-teal-700"
          :max="totalTicks"
          :value="playback.currentTick"
        ></progress>
      </div>
    </InfoPanel>

    <InfoPanel>
      <dl class="grid grid-cols-[minmax(6rem,1fr)_minmax(5rem,1fr)_minmax(0,1.5fr)] gap-x-3">
        <div v-for="field in infoFields" :key="field.label" class="min-w-0">
          <dt class="h-4 truncate text-xs text-slate-500" :title="field.label">
            {{ field.label }}
          </dt>
          <dd class="h-5 truncate font-medium text-slate-900 tabular-nums" :title="field.value">
            {{ field.value }}
          </dd>
        </div>
      </dl>
      <div class="flex h-6 items-center gap-2">
        <span class="min-w-0 flex-1 truncate text-xs text-slate-500">
          {{ infoSummary }}
        </span>
        <ControlButton
          compact
          :disabled="!sheet.selectedNotes.length || playback.playing"
          title="Hear the selected notes"
          @click="playback.play(sheet.selectedNotes, sheet.span!.from, sheet.span!.to)"
        >
          Hear
        </ControlButton>
      </div>
    </InfoPanel>
  </aside>

  <dialog
    ref="playbackSettings"
    closedby="any"
    class="m-auto max-h-[calc(100dvh-2rem)] w-96 max-w-[calc(100vw-2rem)] overflow-auto rounded border border-slate-300 bg-white p-4 text-sm text-slate-900 backdrop:bg-slate-900/20"
  >
    <div class="space-y-3">
      <h2 class="font-medium">Playback settings</h2>
      <fieldset :disabled="playback.playing" class="space-y-2">
        <div class="flex items-baseline justify-between gap-3">
          <label for="tempo" class="text-xs text-slate-500">Tempo</label>
          <output for="tempo" class="font-medium text-slate-900 tabular-nums">
            {{ playback.bpm }} <span class="text-xs font-normal text-slate-500">BPM</span>
          </output>
        </div>
        <input
          id="tempo"
          v-model.number="playback.bpm"
          class="block w-full accent-teal-700 disabled:opacity-40"
          type="range"
          min="30"
          max="160"
          autofocus
        />
      </fieldset>
    </div>
  </dialog>
</template>
