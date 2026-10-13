<script setup lang="ts">
import { computed, nextTick, useTemplateRef } from 'vue';
import { Settings } from '@lucide/vue';
import { matchStats, type MatchCandidate } from '../following';
import { useFollowingStore } from '../stores/following';
import { usePlaybackStore } from '../stores/playback';
import { useScoreStore } from '../stores/score';
import FollowingDialog from './FollowingDialog.vue';
import InfoPanel from './InfoPanel.vue';

const emit = defineEmits<{ scrollToPlayhead: [] }>();
const following = useFollowingStore();
const playback = usePlaybackStore();
const sheet = useScoreStore();
const dialog = useTemplateRef<InstanceType<typeof FollowingDialog>>('dialog');
const status = computed(() => {
  if (!sheet.score) return 'No score';
  if (playback.playing) return 'Playback';
  if (!following.enabled) return 'Following off';
  return following.active ? 'Following' : 'No MIDI';
});

function beat(candidate: MatchCandidate) {
  const bar = sheet.bars.find((bar) => bar.number === candidate.bar)!;
  return Number((1 + (candidate.at - bar.from) / bar.beatTicks).toFixed(2));
}

function isReturn(candidate: MatchCandidate) {
  return candidate.bar === following.returnPoint?.candidate.bar;
}

async function navigate(candidate: MatchCandidate) {
  if (isReturn(candidate)) following.goBack();
  else following.jump(candidate);
  await nextTick();
  emit('scrollToPlayhead');
}
</script>

<template>
  <InfoPanel class="relative w-68 max-w-[calc(100vw-1.5rem)] overflow-hidden hover:bg-slate-100">
    <div class="flex h-full min-w-0 flex-col gap-1" data-following-panel>
      <div
        class="flex h-4 min-w-0 shrink-0 items-center justify-between gap-2 pr-4 text-xs leading-4"
        :title="following.message"
      >
        <span class="flex min-w-0 flex-1 items-baseline gap-1 whitespace-nowrap text-slate-500">
          <span class="shrink-0">At</span>
          <span class="shrink-0 text-sm leading-4 font-medium text-slate-900 tabular-nums">
            bar {{ following.bar?.number ?? '—' }}
          </span>
          <span class="shrink-0">·</span>
          <span class="truncate">{{ status }}</span>
        </span>
        <button
          type="button"
          title="Following settings"
          class="absolute inset-0 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          @click="dialog?.showModal()"
        >
          <Settings :size="12" class="absolute top-1 right-1 text-slate-400" />
          <span class="sr-only">Following settings</span>
        </button>
      </div>
      <div class="-mx-3 -mb-3 flex min-h-0 min-w-0 flex-1">
        <button
          v-for="candidate in following.options"
          :key="candidate.bar"
          type="button"
          :data-jump-option="isReturn(candidate) ? undefined : ''"
          :data-jump-bar="isReturn(candidate) ? undefined : candidate.bar"
          :data-return-option="isReturn(candidate) ? '' : undefined"
          class="relative z-10 flex min-w-0 flex-1 cursor-pointer flex-col px-3 pt-2 pb-3 text-left text-xs tabular-nums enabled:hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="playback.playing"
          :title="
            isReturn(candidate)
              ? `Return to the position before the jump in bar ${following.returnPoint!.bar}`
              : `Bar ${candidate.bar} · beat ${beat(candidate)}: ${matchStats(candidate).matches} matched, ${matchStats(candidate).extra} extra, ${matchStats(candidate).missed} omitted. Click to jump.`
          "
          @click="navigate(candidate)"
        >
          <span class="truncate leading-4 font-medium text-slate-900">
            Bar {{ isReturn(candidate) ? following.returnPoint!.bar : candidate.bar }}
          </span>
          <span v-if="isReturn(candidate)" class="truncate text-[10px] leading-3.5 text-slate-500"
            >Return</span
          >
          <template v-else>
            <span class="leading-3.5 font-medium text-slate-700">
              {{ Math.round(matchStats(candidate).score * 100) }}%
            </span>
            <span class="truncate text-[10px] leading-3 text-slate-500">
              {{ matchStats(candidate).matches }} matched
            </span>
          </template>
        </button>
        <p
          v-if="!following.options.length"
          class="min-w-0 self-center overflow-hidden p-3 text-xs leading-4 text-slate-500"
          :title="following.message"
        >
          {{ following.searching ? 'Searching other bars…' : following.message }}
        </p>
      </div>
    </div>
  </InfoPanel>
  <FollowingDialog ref="dialog" />
</template>
