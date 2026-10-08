<script setup lang="ts">
import { computed, nextTick, useTemplateRef } from 'vue';
import { LocateFixed, Pause, Play, Settings, SkipBack } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { chordNames } from '../chords';
import { pitchLabel } from '../music';
import { usePlaybackStore } from '../stores/playback';
import { useScoreStore } from '../stores/score';
import ControlButton from './ControlButton.vue';
import InfoPanel from './InfoPanel.vue';
import MidiPanel from './MidiPanel.vue';

const emit = defineEmits<{ scrollToPlayhead: [] }>();
const sheet = useScoreStore();
const { score, ticksPerBar, totalTicks, barCount } = storeToRefs(sheet);
const playback = usePlaybackStore();
const settings = useTemplateRef<HTMLDialogElement>('settings');
const playLabel = computed(() =>
  playback.playing ? 'Pause' : playback.paused ? 'Resume' : 'Play',
);

function togglePlayback() {
  if (!score.value) return;
  if (playback.playing) return playback.pause();
  if (playback.paused) return playback.resume();
  return playback.play(
    score.value.notes,
    playback.currentTick < totalTicks.value ? playback.currentTick : 0,
    totalTicks.value,
  );
}

async function goToStart() {
  await playback.seek(0);
  await nextTick();
  emit('scrollToPlayhead');
}

const infoSummary = computed(() => {
  if (sheet.selectedNotes.length === 1) return pitchLabel(sheet.selectedNotes[0]!.pitch);
  if (sheet.selectedNotes.length || sheet.selection.kind === 'range')
    return `${sheet.selectedNotes.length} notes`;
  return 'Whole piece';
});
const position = computed(() =>
  sheet.span && score.value
    ? `${Math.floor(sheet.span.from / ticksPerBar.value) + 1} · ${(sheet.span.from % ticksPerBar.value) / score.value.ppq + 1}`
    : '—',
);
const possibleChord = computed(() => chordNames(sheet.selectedNotes).join(' / ') || '—');
const infoFields = computed(() => {
  if (!score.value) return [];
  const tempo = { label: 'Tempo', value: `${playback.bpm} BPM` };
  const span = sheet.span;
  if (!span) {
    return [
      tempo,
      { label: 'Meter', value: score.value.meter.join('/') },
      { label: 'Length', value: `${barCount.value} measures` },
    ];
  }
  const singleNote = sheet.selectedNotes.length === 1;
  return [
    { label: 'Measure · beat', value: position.value },
    {
      label: singleNote && sheet.selection.kind === 'notes' ? 'Duration' : 'Time span',
      value: `${(span.to - span.from) / score.value.ppq} beats`,
    },
    singleNote ? tempo : { label: 'Possible chord', value: possibleChord.value },
  ];
});
</script>

<template>
  <aside
    class="grid max-h-[35dvh] overflow-auto border-t border-slate-200 bg-slate-50"
    :class="score ? 'sm:grid-cols-2 lg:grid-cols-3' : ''"
  >
    <InfoPanel v-if="score" class="border-b sm:border-r lg:border-b-0">
      <div class="flex items-center gap-2">
        <ControlButton primary icon-only :title="playLabel" @click="togglePlayback">
          <Pause v-if="playback.playing" :size="16" />
          <Play v-else :size="16" />
          <span class="sr-only">{{ playLabel }}</span>
        </ControlButton>
        <ControlButton icon-only title="Go to start" @click="goToStart">
          <SkipBack :size="16" />
          <span class="sr-only">Go to start</span>
        </ControlButton>
        <ControlButton icon-only title="Scroll to playhead" @click="emit('scrollToPlayhead')">
          <LocateFixed :size="16" />
          <span class="sr-only">Scroll to playhead</span>
        </ControlButton>
        <ControlButton
          icon-only
          title="Settings"
          :disabled="playback.playing"
          @click="settings?.showModal()"
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

    <InfoPanel v-if="score" class="border-b lg:border-r lg:border-b-0">
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
    <MidiPanel :class="score ? 'sm:col-span-2 lg:col-span-1' : ''" />
  </aside>

  <dialog
    v-if="score"
    ref="settings"
    closedby="any"
    class="m-auto max-h-[calc(100dvh-2rem)] w-96 max-w-[calc(100vw-2rem)] overflow-auto rounded border border-slate-300 bg-white p-4 text-sm text-slate-900 backdrop:bg-slate-900/20"
  >
    <div class="space-y-3">
      <h2 class="font-medium">Settings</h2>
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
      <fieldset class="space-y-2">
        <div class="flex items-baseline justify-between gap-3">
          <label for="fold-threshold" class="text-xs text-slate-500">Fold pitch gaps</label>
          <output for="fold-threshold" class="font-medium text-slate-900 tabular-nums">
            {{ sheet.foldThreshold === 0 ? '0 (off)' : `${sheet.foldThreshold} unused pitches` }}
          </output>
        </div>
        <input
          id="fold-threshold"
          v-model.number="sheet.foldThreshold"
          class="block w-full accent-teal-700"
          type="range"
          min="0"
          max="15"
          step="1"
        />
        <p class="text-xs text-slate-500">
          Fold gaps with at least this many unused pitches in a line. Set to 0 to disable.
        </p>
      </fieldset>
    </div>
  </dialog>
</template>
