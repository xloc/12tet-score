import { ref } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { score, seconds, type Note } from '../music.ts';

export const usePlaybackStore = defineStore('playback', () => {
  const bpm = ref(score.bpm);
  const playing = ref(false);
  const currentTick = ref(0);
  let audio: AudioContext | undefined;
  let frame = 0;

  function stop() {
    cancelAnimationFrame(frame);
    const context = audio;
    audio = undefined;
    playing.value = false;
    if (context) void context.close();
  }

  async function play(notes: Note[], from: number, to: number) {
    stop();
    const context = new AudioContext();
    audio = context;
    await context.resume();
    if (audio !== context) return;
    const origin = context.currentTime + 0.03;
    const end = origin + seconds(to - from, bpm.value);
    currentTick.value = from;
    playing.value = true;

    for (const note of notes) {
      const start = origin + seconds(Math.max(note.at, from) - from, bpm.value);
      const finish = origin + seconds(Math.min(note.at + note.len, to) - from, bpm.value);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.04, start + 0.005);
      gain.gain.setValueAtTime(0.04, finish - 0.02);
      gain.gain.linearRampToValueAtTime(0, finish);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(finish);
    }

    function update() {
      if (audio !== context) return;
      currentTick.value = Math.min(
        to,
        from + ((Math.max(0, context.currentTime - origin) * bpm.value) / 60) * score.ppq,
      );
      if (context.currentTime >= end) stop();
      else frame = requestAnimationFrame(update);
    }
    update();
  }

  return { bpm, playing, currentTick, play, stop };
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => usePlaybackStore().stop());
  import.meta.hot.accept(acceptHMRUpdate(usePlaybackStore, import.meta.hot));
}
