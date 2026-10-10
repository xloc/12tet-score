<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
import { Plug, Unplug } from '@lucide/vue';
import { pitchLabel } from '../music';
import { useMidiStore } from '../stores/midi';
import { usePlaybackStore } from '../stores/playback';
import { useScoreStore } from '../stores/score';
import ControlButton from './ControlButton.vue';

const sheet = useScoreStore();
const playback = usePlaybackStore();
const midi = useMidiStore();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const keys = computed(() => midi.pressedPitches.map(pitchLabel).join(' · '));
const status = computed(() => {
  if (midi.connecting) return 'Connecting…';
  if (!midi.ready) return 'Not connected';
  return midi.connectedCount ? 'Connected' : 'No device';
});

defineExpose({
  showModal() {
    dialog.value?.showModal();
  },
});
</script>

<template>
  <dialog
    ref="dialog"
    closedby="any"
    class="pointer-events-auto m-auto max-h-[calc(100dvh-2rem)] w-96 max-w-[calc(100vw-2rem)] overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-4 text-[13px] text-slate-900 backdrop:bg-slate-900/20"
  >
    <div class="space-y-5">
      <fieldset class="min-w-0">
        <legend class="mb-1.5 px-3 text-xs text-slate-500">Score display</legend>
        <div class="divide-y divide-slate-100 rounded-xl bg-white px-3">
          <div class="space-y-2 py-3">
            <div class="flex items-baseline justify-between gap-3">
              <label for="fold-threshold">Fold pitch gaps</label>
              <output for="fold-threshold" class="text-slate-500 tabular-nums">
                {{ sheet.foldThreshold === 0 ? 'Off' : `${sheet.foldThreshold} unused pitches` }}
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
          </div>
          <div class="space-y-2 py-3">
            <label
              for="variable-bar-width"
              class="flex cursor-pointer items-center justify-between gap-3"
            >
              <span>Variable bar width</span>
              <span class="flex items-center gap-2">
                <output for="variable-bar-width" class="text-slate-500">{{
                  sheet.variableBarWidth ? 'On' : 'Off'
                }}</output>
                <span class="relative inline-flex h-5 w-9 shrink-0">
                  <input
                    id="variable-bar-width"
                    v-model="sheet.variableBarWidth"
                    class="peer sr-only"
                    type="checkbox"
                  />
                  <span
                    class="h-full w-full rounded-full bg-slate-200 transition-colors peer-checked:bg-teal-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-700"
                  ></span>
                  <span
                    class="pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform peer-checked:translate-x-4"
                  ></span>
                </span>
              </span>
            </label>
            <p class="text-xs text-slate-500">Give simpler measures less space.</p>
          </div>
        </div>
      </fieldset>

      <fieldset class="min-w-0">
        <legend class="mb-1.5 px-3 text-xs text-slate-500">MIDI</legend>
        <div class="divide-y divide-slate-100 rounded-xl bg-white px-3">
          <div class="space-y-2 py-3">
            <div class="flex items-center justify-between gap-3">
              <span>Connection</span>
              <div class="flex items-center gap-2">
                <span class="text-slate-500">{{
                  midi.unavailable ? 'Unavailable' : midi.error ? 'Error' : status
                }}</span>
                <ControlButton
                  v-if="!midi.unavailable"
                  icon-only
                  type="button"
                  :title="midi.ready ? 'Disconnect MIDI' : 'Connect MIDI'"
                  :disabled="midi.connecting"
                  @click="midi.ready ? midi.disconnect() : midi.connect()"
                >
                  <Unplug v-if="midi.ready" :size="16" />
                  <Plug v-else :size="16" />
                  <span class="sr-only">{{ midi.ready ? 'Disconnect MIDI' : 'Connect MIDI' }}</span>
                </ControlButton>
              </div>
            </div>
            <p v-if="midi.unavailable || midi.error" class="text-xs text-slate-500">
              {{ midi.unavailable || midi.error }}
            </p>
          </div>
          <ul v-if="Object.keys(midi.inputs).length" class="divide-y divide-slate-100">
            <li
              v-for="(input, id) in midi.inputs"
              :key="id"
              class="flex items-baseline justify-between gap-3 py-2.5"
            >
              <span class="min-w-0 break-words">{{ input.name || 'Unnamed MIDI input' }}</span>
              <span class="shrink-0 text-slate-500">{{
                input.state === 'connected' ? 'Connected' : 'Disconnected'
              }}</span>
            </li>
          </ul>
          <p v-else-if="midi.ready" class="py-3 text-xs text-slate-500">
            Connect a USB or Bluetooth MIDI keyboard to your computer to see it here.
          </p>
          <dl v-if="midi.connectedCount" class="flex items-baseline justify-between gap-3 py-3">
            <dt class="shrink-0">Keys pressed</dt>
            <dd class="min-w-0 text-right break-words text-slate-500">{{ keys || 'None' }}</dd>
          </dl>
        </div>
      </fieldset>

      <fieldset v-if="sheet.score" :disabled="playback.playing" class="min-w-0">
        <legend class="mb-1.5 px-3 text-xs text-slate-500">Playback</legend>
        <div class="space-y-2 rounded-xl bg-white p-3">
          <div class="flex items-baseline justify-between gap-3">
            <label for="tempo">Playback speed</label>
            <output for="tempo" class="text-slate-500 tabular-nums">
              {{ playback.bpm }} <span class="text-xs">BPM</span>
            </output>
          </div>
          <input
            id="tempo"
            v-model.number="playback.bpm"
            class="block w-full accent-teal-700 disabled:opacity-40"
            type="range"
            min="30"
            max="160"
          />
          <p class="text-xs text-slate-500">
            {{
              playback.playing
                ? 'Pause playback to change its speed.'
                : 'Adjust playback without changing the score tempo.'
            }}
          </p>
        </div>
      </fieldset>
    </div>
  </dialog>
</template>
