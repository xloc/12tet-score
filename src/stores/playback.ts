import { computed, ref, watch } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { seconds, type Note } from '../music.ts';
import { useScoreStore } from './score.ts';

export const usePlaybackStore = defineStore('playback', () => {
  const sheet = useScoreStore();
  const bpm = ref(sheet.score?.bpm ?? 0);
  const status = ref<'stopped' | 'playing' | 'paused'>('stopped');
  const playing = computed(() => status.value === 'playing');
  const paused = computed(() => status.value === 'paused');
  const currentTick = ref(0);
  let audio: AudioContext | undefined;
  let frame = 0;
  let session: { notes: Note[]; to: number } | undefined;
  let updateTick = () => {};

  watch(
    () => sheet.score,
    () => {
      stop();
      bpm.value = sheet.score?.bpm ?? 0;
    },
    { flush: 'sync' },
  );

  function stopAudio() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    const context = audio;
    audio = undefined;
    status.value = 'stopped';
    updateTick = () => {};
    if (context) void context.close();
  }

  function stop() {
    stopAudio();
    session = undefined;
    currentTick.value = 0;
  }

  function pause() {
    if (!playing.value) return;
    updateTick();
    stopAudio();
    status.value = 'paused';
  }

  function resume() {
    if (!paused.value || !session) return;
    return play(session.notes, currentTick.value, session.to);
  }

  function seek(tick: number) {
    const score = sheet.score;
    if (!score) return;
    const wasPlaying = playing.value;
    const wasPaused = paused.value;
    stopAudio();
    session = undefined;
    currentTick.value = Math.max(0, Math.min(sheet.totalTicks, tick));
    if (currentTick.value === sheet.totalTicks) return;
    if (wasPlaying) return play(score.notes, currentTick.value, sheet.totalTicks);
    if (wasPaused) {
      session = { notes: score.notes, to: sheet.totalTicks };
      status.value = 'paused';
    }
  }

  async function play(notes: Note[], from: number, to: number) {
    if (!sheet.score) return;
    stopAudio();
    currentTick.value = from;
    session = undefined;
    if (from >= to) return;
    session = { notes, to };
    const tempo = bpm.value;
    const ppq = sheet.score.ppq;
    const context = new AudioContext();
    audio = context;
    status.value = 'playing';
    await context.resume();
    if (audio !== context) return;
    const origin = context.currentTime + 0.03;
    const end = origin + seconds(to - from, tempo, ppq);

    for (const note of notes) {
      if (note.at >= to || note.at + note.len <= from) continue;
      const start = origin + seconds(Math.max(note.at, from) - from, tempo, ppq);
      const finish = origin + seconds(Math.min(note.at + note.len, to) - from, tempo, ppq);
      const attack = Math.min(0.005, (finish - start) / 2);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.04, start + attack);
      gain.gain.setValueAtTime(0.04, Math.max(start + attack, finish - 0.02));
      gain.gain.linearRampToValueAtTime(0, finish);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(finish);
    }

    updateTick = () => {
      currentTick.value = Math.min(
        to,
        from + ((Math.max(0, context.currentTime - origin) * tempo) / 60) * ppq,
      );
    };
    function update() {
      if (audio !== context) return;
      updateTick();
      if (context.currentTime >= end) {
        stopAudio();
        session = undefined;
      } else frame = requestAnimationFrame(update);
    }
    update();
  }

  return { bpm, status, playing, paused, currentTick, play, pause, resume, seek, stop };
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => usePlaybackStore().stop());
  import.meta.hot.accept(acceptHMRUpdate(usePlaybackStore, import.meta.hot));
}
