<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';
import { distantJumpPolicy } from '../following';
import { useFollowingStore } from '../stores/following';
import { useScoreStore } from '../stores/score';
import FollowingVisualization from './FollowingVisualization.vue';

const following = useFollowingStore();
const sheet = useScoreStore();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const visible = ref(false);
const options = [
  { key: 'enabled', label: 'Follow MIDI' },
  { key: 'allowDistant', label: 'Automatic distant jumps' },
] as const;
const details = computed(() =>
  following.result
    ? {
        ...following.result,
        candidates: [
          ...following.result.candidates,
          ...following.candidates.filter((candidate) => candidate.mode === 'jump'),
        ],
      }
    : null,
);

defineExpose({
  showModal() {
    visible.value = true;
    dialog.value?.showModal();
  },
});
</script>

<template>
  <dialog
    ref="dialog"
    closedby="any"
    class="pointer-events-auto m-auto h-[44rem] max-h-[calc(100dvh-2rem)] w-[38rem] max-w-[calc(100vw-2rem)] overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-4 text-[13px] text-slate-900 backdrop:bg-slate-900/20"
    @close="visible = false"
  >
    <div class="flex h-full min-h-0 flex-col gap-4">
      <fieldset class="min-w-0 shrink-0">
        <legend class="mb-1.5 px-3 text-xs text-slate-500">MIDI following</legend>
        <div class="divide-y divide-slate-100 rounded-xl bg-white px-3">
          <label
            v-for="option in options"
            :key="option.key"
            class="flex items-center justify-between gap-3 py-3"
          >
            <span>{{ option.label }}</span>
            <input
              v-model="following[option.key]"
              :id="`following-${option.key}`"
              type="checkbox"
            />
          </label>
        </div>
        <div class="mt-1.5 space-y-1 px-3 text-xs font-normal text-slate-500">
          <p>
            Follow the current bar, the previous two bars, and the next bar. Distant suggestions
            remain clickable when automatic distant jumps are off.
          </p>
          <p>
            Automatic distant jumps require {{ distantJumpPolicy.matches }} matching notes across
            {{ distantJumpPolicy.onsets }} score positions, at least
            {{ distantJumpPolicy.score * 100 }}% agreement, and a clear lead over alternatives.
          </p>
        </div>
      </fieldset>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <p class="mb-1.5 px-3 text-xs text-slate-500">Matching details</p>
        <div class="flex min-h-0 flex-1 flex-col gap-1 rounded-xl bg-white p-3">
          <div class="h-8 shrink-0">
            <p class="h-4 truncate leading-4" :title="following.message">
              {{ following.message }}
            </p>
            <div class="flex h-4 min-w-0 items-center gap-2 text-xs leading-4 text-slate-500">
              <p class="min-w-0 flex-1 truncate" :title="following.lastMovement?.reason">
                {{
                  following.lastMovement?.reason !== following.message
                    ? following.lastMovement?.reason
                    : ''
                }}
              </p>
              <span v-if="following.searching" class="shrink-0">Searching other bars…</span>
            </div>
          </div>
          <FollowingVisualization
            v-if="visible"
            class="flex-1"
            :result="details"
            :pitches="following.recentPitches"
            :bars="sheet.bars"
            :focus-bar="following.bar?.number ?? 1"
          />
        </div>
        <p class="mt-1.5 shrink-0 px-3 text-xs text-slate-500">
          Match score = matched ÷ (matched + extra + omitted). The score describes note agreement;
          the matched count shows how much evidence supports it.
        </p>
      </div>
    </div>
  </dialog>
</template>
