<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
import { Settings } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { chordNames } from '../chords';
import { pitchLabel } from '../music';
import { tempoAt } from '../timing';
import { usePlaybackStore } from '../stores/playback';
import { useScoreStore } from '../stores/score';
import InfoPanel from './InfoPanel.vue';
import MidiStatus from './MidiStatus.vue';
import SettingsDialog from './SettingsDialog.vue';

const { score, barCount, selectedNotes, span } = storeToRefs(useScoreStore());
const settings = useTemplateRef<InstanceType<typeof SettingsDialog>>('settings');
const playback = usePlaybackStore();
const meter = computed(
  () =>
    score.value?.meters.filter((meter) => meter.at <= Math.max(0, playback.currentTick)).at(-1)
      ?.meter,
);
const tempo = computed(() =>
  score.value ? tempoAt(score.value.tempos, playback.currentTick).bpm : 0,
);
const context = computed(() => {
  const notes = selectedNotes.value;
  if (notes.length === 1) return { label: 'NOTE', value: pitchLabel(notes[0]!.pitch) };
  const chord = notes.length > 1 ? chordNames(notes)[0] : undefined;
  return chord ? { label: 'CHORD', value: chord } : null;
});
</script>

<template>
  <InfoPanel class="relative w-72 hover:bg-slate-100">
    <div class="grid h-full grid-cols-2 grid-rows-2 items-center gap-x-3 gap-y-1.5">
      <template v-if="score && span">
        <dl v-if="context" class="row-span-2 min-w-0">
          <dt class="text-[10px] leading-3 text-slate-500">{{ context.label }}</dt>
          <dd class="truncate text-lg leading-6 font-medium text-slate-900" :title="context.value">
            {{ context.value }}
          </dd>
        </dl>
        <dl class="min-w-0" :class="{ 'col-span-2': !context }">
          <dt class="text-[10px] leading-3 text-slate-500">SELECTED</dt>
          <dd
            class="truncate text-sm leading-5"
            :class="context ? 'text-slate-500' : 'text-slate-900'"
          >
            {{ selectedNotes.length }}
            <span class="text-xs">{{ selectedNotes.length === 1 ? 'note' : 'notes' }}</span>
          </dd>
        </dl>
      </template>
      <template v-else-if="score">
        <dl class="min-w-0">
          <dt class="text-[10px] leading-3 text-slate-500">WHOLE PIECE</dt>
          <dd class="truncate leading-5 font-medium text-slate-900" :title="`${barCount} measures`">
            {{ barCount }} <span class="text-xs font-normal text-slate-500">measures</span>
          </dd>
        </dl>
        <dl class="min-w-0">
          <dt class="text-[10px] leading-3 text-slate-500">TEMPO</dt>
          <dd
            class="truncate leading-5 font-medium text-slate-900"
            :title="`Score tempo at the playhead: ${tempo} BPM`"
          >
            {{ tempo }} <span class="text-xs font-normal text-slate-500">BPM</span>
          </dd>
        </dl>
        <dl class="min-w-0">
          <dt class="text-[10px] leading-3 text-slate-500">METER</dt>
          <dd class="truncate leading-5 font-medium text-slate-900">
            {{ meter }}
          </dd>
        </dl>
      </template>
      <MidiStatus :class="{ 'col-span-2': !score || (span && !context), 'row-span-2': !score }" />
      <button
        type="button"
        title="Settings"
        class="absolute inset-0 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        @click="settings?.showModal()"
      >
        <Settings :size="12" class="absolute top-1 right-1 text-slate-400" />
        <span class="sr-only">Settings</span>
      </button>
    </div>
  </InfoPanel>
  <SettingsDialog ref="settings" />
</template>
