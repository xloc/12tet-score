import { computed, onScopeDispose, ref } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';

type MidiInput = Pick<MIDIPort, 'name' | 'state'> & {
  pressed: Record<number, Set<number>>;
};

export const useMidiStore = defineStore('midi', () => {
  const unavailable = ref(
    globalThis.isSecureContext === false
      ? 'MIDI requires HTTPS or localhost.'
      : typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function'
        ? 'Web MIDI is unavailable in this browser. Use desktop Chrome or Edge.'
        : '',
  );
  const connecting = ref(false);
  const ready = ref(false);
  const error = ref('');
  const inputs = ref<Record<string, MidiInput>>({});
  const connectedCount = computed(
    () => Object.values(inputs.value).filter((input) => input.state === 'connected').length,
  );
  const pressedPitches = computed(() =>
    [
      ...new Set(
        Object.values(inputs.value).flatMap((input) =>
          Object.values(input.pressed).flatMap((pitches) => [...pitches]),
        ),
      ),
    ].sort((a, b) => a - b),
  );
  let access: MIDIAccess | undefined;
  let disposed = false;

  function updateInput(port: MIDIPort | null) {
    if (port?.type !== 'input') return;
    const { name, state } = port;
    inputs.value[port.id] = {
      name,
      state,
      pressed: state === 'connected' ? (inputs.value[port.id]?.pressed ?? {}) : {},
    };
    const input = port as MIDIInput;
    if (state === 'disconnected') input.onmidimessage = null;
    else if (!input.onmidimessage) {
      input.onmidimessage = (event) => receiveMessage(port.id, event.data);
    }
  }

  function receiveMessage(id: string, data: MIDIMessageEvent['data']) {
    if (!data || data.length < 3) return;
    const [status, pitch, velocity] = data;
    const command = status! & 0xf0;
    const channel = status! & 0x0f;
    const pressed = inputs.value[id]!.pressed;
    if (command === 0x90 && velocity! > 0) {
      (pressed[channel] ??= new Set()).add(pitch!);
    } else if (command === 0x80 || command === 0x90) {
      pressed[channel]?.delete(pitch!);
    } else if (command === 0xb0 && (pitch === 120 || pitch === 123)) {
      delete pressed[channel];
    }
  }

  async function connect() {
    if (unavailable.value || connecting.value || ready.value) return;
    connecting.value = true;
    error.value = '';
    try {
      const result = await navigator.requestMIDIAccess({ sysex: false });
      if (disposed) return;
      access = result;
      access.onstatechange = (event) => updateInput(event.port);
      access.inputs.forEach(updateInput);
      ready.value = true;
    } catch (cause) {
      error.value =
        cause instanceof Error && cause.name === 'NotAllowedError'
          ? 'MIDI permission denied. Allow MIDI access in your browser, then try again.'
          : cause instanceof Error
            ? cause.message
            : String(cause);
    } finally {
      connecting.value = false;
    }
  }

  onScopeDispose(() => {
    disposed = true;
    if (access) {
      access.onstatechange = null;
      access.inputs.forEach((input) => {
        input.onmidimessage = null;
        void input.close();
      });
    }
    for (const input of Object.values(inputs.value)) input.pressed = {};
  });

  return { unavailable, connecting, ready, error, inputs, connectedCount, pressedPitches, connect };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMidiStore, import.meta.hot));
}
