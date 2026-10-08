import { computed, ref } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { score, seconds, totalTicks, type Note } from '../music.ts';

export const usePlaybackStore = defineStore('playback', () => {
  const bpm = ref(score.bpm);
  const status = ref<'stopped' | 'playing' | 'paused'>('stopped');
  const playing = computed(() => status.value === 'playing');
  const paused = computed(() => status.value === 'paused');
  const currentTick = ref(0);
  let audio: AudioContext | undefined;
  let frame = 0;
  let session: { notes: Note[]; to: number } | undefined;
  let updateTick = () => {};

  function stopAudio() {
    cancelAnimationFrame(frame);
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
    const wasPlaying = playing.value;
    const wasPaused = paused.value;
    stopAudio();
    session = undefined;
    currentTick.value = Math.max(0, Math.min(totalTicks, tick));
    if (currentTick.value === totalTicks) return;
    if (wasPlaying) return play(score.notes, currentTick.value, totalTicks);
    if (wasPaused) {
      session = { notes: score.notes, to: totalTicks };
      status.value = 'paused';
    }
  }

  async function play(notes: Note[], from: number, to: number) {
    stopAudio();
    currentTick.value = from;
    session = undefined;
    if (from >= to) return;
    session = { notes, to };
    const tempo = bpm.value;
    const context = new AudioContext();
    audio = context;
    status.value = 'playing';
    await context.resume();
    if (audio !== context) return;
    const origin = context.currentTime + 0.03;
    const end = origin + seconds(to - from, tempo);

    for (const note of notes) {
      if (note.at >= to || note.at + note.len <= from) continue;
      const start = origin + seconds(Math.max(note.at, from) - from, tempo);
      const finish = origin + seconds(Math.min(note.at + note.len, to) - from, tempo);
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
        from + ((Math.max(0, context.currentTime - origin) * tempo) / 60) * score.ppq,
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
