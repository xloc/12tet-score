import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import {
  compareMatches,
  followingWindow,
  isDistant,
  matchStats,
  ScoreFollower,
  type MatchCandidate,
  type MatchResult,
} from '../following';
import { automaticLocation, type SearchRequest, type SearchResponse } from '../following-search';
import { useMidiStore } from './midi';
import { usePlaybackStore } from './playback';
import { useScoreStore } from './score';

export const useFollowingStore = defineStore('following', () => {
  const sheet = useScoreStore();
  const playback = usePlaybackStore();
  const midi = useMidiStore();
  const enabled = ref(true);
  const allowDistant = ref(false);
  const result = shallowRef<MatchResult | null>(null);
  const distantCandidates = shallowRef<MatchCandidate[]>([]);
  const searching = ref(false);
  const retainedOptions = shallowRef<MatchCandidate[] | null>(null);
  const returnPoint = shallowRef<{
    tick: number;
    bar: number;
    candidate: MatchCandidate;
    index: number;
  } | null>(null);
  const lastMovement = shallowRef<{
    from: number;
    to: number;
    decision: MatchResult['decision'];
    reason: string;
  } | null>(null);
  const recentPitches = ref<number[]>([]);
  const bar = computed(
    () =>
      sheet.bars.find((bar) => playback.currentTick >= bar.from && playback.currentTick < bar.to) ??
      sheet.bars.at(-1),
  );
  const active = computed(
    () => enabled.value && !!sheet.score && !!midi.connectedCount && !playback.playing,
  );
  const candidates = computed(() => {
    const best = new Map<number, MatchCandidate>();
    for (const item of [...(result.value?.candidates ?? []), ...distantCandidates.value].sort(
      compareMatches,
    )) {
      if (!best.has(item.bar)) best.set(item.bar, item);
    }
    return [...best.values()];
  });
  const suggestions = computed(() =>
    candidates.value
      .filter(
        (candidate) => candidate.bar !== bar.value?.number && matchStats(candidate).matches >= 2,
      )
      .slice(0, 3),
  );
  const options = computed(() => {
    const items = [...(retainedOptions.value ?? suggestions.value)];
    const previous = returnPoint.value;
    if (previous) {
      const index = items.findIndex((candidate) => candidate.bar === previous.candidate.bar);
      if (index >= 0) items.splice(index, 1);
      items.splice(Math.min(previous.index, items.length), 0, previous.candidate);
    }
    return items.slice(0, 3);
  });
  const message = computed(() => {
    if (!enabled.value) return 'MIDI following is off.';
    if (!sheet.score) return 'Open a score to start matching.';
    if (playback.playing) return 'Listening: audio controls the playhead.';
    if (!midi.connectedCount) return 'Connect a MIDI keyboard to start matching.';
    return result.value?.reason ?? `Play to match bar ${bar.value?.number ?? 1}.`;
  });
  let matcher: ScoreFollower | undefined;
  let worker: Worker | undefined;
  let moving = false;
  let generation = 0;
  let request = 0;

  function initializeSearch() {
    generation++;
    request = 0;
    distantCandidates.value = [];
    searching.value = false;
    if (!matcher || typeof Worker === 'undefined') return;
    if (!worker) {
      worker = new Worker(new URL('../following-search.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (event: MessageEvent<SearchResponse>) => {
        if (event.data.generation !== generation || event.data.id !== request || !active.value)
          return;
        distantCandidates.value = event.data.candidates;
        searching.value = false;
        applyAutomaticLocation();
      };
    }
    const message: SearchRequest = { type: 'init', generation, reference: matcher.reference };
    worker.postMessage(message);
  }

  function reset() {
    matcher?.reset(playback.currentTick);
    result.value = null;
    lastMovement.value = null;
    recentPitches.value = [];
    retainedOptions.value = null;
    initializeSearch();
  }

  function move(tick: number, decision: MatchResult['decision'], reason: string) {
    const from = bar.value!.number;
    const target = sheet.bars.find((bar) => tick >= bar.from && tick < bar.to)!;
    if (
      target.number !== from ||
      (decision === 'restarted' &&
        (tick < playback.currentTick || lastMovement.value?.decision !== 'restarted'))
    ) {
      lastMovement.value = { from, to: target.number, decision, reason };
    }
    moving = true;
    void playback.seek(tick);
    moving = false;
  }

  function jump(candidate: MatchCandidate, automatic = false) {
    if (!matcher || playback.playing) return;
    if (!automatic || isDistant(bar.value!.number, candidate.bar)) {
      const items = [...options.value];
      let index = items.findIndex((option) => option.bar === candidate.bar);
      if (index < 0) {
        items.unshift(candidate);
        index = 0;
      }
      retainedOptions.value = items.slice(0, 3);
      returnPoint.value = {
        tick: playback.currentTick,
        bar: bar.value!.number,
        candidate,
        index,
      };
    }
    matcher.choose(candidate);
    const reason = automatic
      ? `Automatically moved to bar ${candidate.bar} after ${matchStats(candidate).matches} matching notes.`
      : `Selected bar ${candidate.bar} at the matched position.`;
    move(candidate.at, 'jumped', reason);
    recentPitches.value = candidate.evidence.map((item) => item.pitch);
    result.value = {
      decision: 'jumped',
      reason,
      tick: candidate.at,
      candidates: [{ ...candidate, mode: 'continue', cost: 0 }],
    };
    initializeSearch();
  }

  function applyAutomaticLocation() {
    if (!active.value || !distantCandidates.value.length || !bar.value) return;
    const location = automaticLocation(candidates.value, bar.value.number, allowDistant.value);
    if (location) jump(location, true);
  }

  function goBack() {
    const previous = returnPoint.value;
    if (!previous || playback.playing) return;
    const items = [...options.value];
    moving = true;
    void playback.seek(previous.tick);
    moving = false;
    returnPoint.value = null;
    reset();
    retainedOptions.value = items;
  }

  watch(
    () => sheet.score,
    () => {
      matcher = sheet.score ? new ScoreFollower(sheet.score, playback.currentTick) : undefined;
      returnPoint.value = null;
      reset();
    },
    { immediate: true, flush: 'sync' },
  );
  watch([enabled, () => playback.playing, () => midi.connectedCount], reset, { flush: 'sync' });
  watch(allowDistant, applyAutomaticLocation, { flush: 'sync' });
  watch(
    () => playback.currentTick,
    () => {
      if (!moving && !playback.playing) reset();
    },
    { flush: 'sync' },
  );
  const stopActions = playback.$onAction(({ name, after }) => {
    if (!moving && (name === 'seek' || name === 'stop')) after(reset);
  });
  const stopNotes = midi.onNoteOn((pitch) => {
    if (!active.value || !matcher) return;
    retainedOptions.value = null;
    recentPitches.value = [...recentPitches.value, pitch].slice(-followingWindow);
    result.value = matcher.receive(pitch);
    const match = result.value;
    if (match.tick !== undefined) move(match.tick, match.decision, match.reason);
    if (worker) {
      searching.value = true;
      const message: SearchRequest = {
        type: 'search',
        generation,
        id: ++request,
        pitches: [...recentPitches.value],
      };
      worker.postMessage(message);
    }
  });
  onScopeDispose(() => {
    stopNotes();
    stopActions();
    if (worker) {
      worker.onmessage = null;
      worker.terminate();
    }
  });

  return {
    enabled,
    allowDistant,
    active,
    bar,
    message,
    result,
    lastMovement,
    recentPitches,
    candidates,
    suggestions,
    options,
    searching,
    returnPoint,
    jump,
    goBack,
  };
});

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useFollowingStore, import.meta.hot));
