import { computed, ref } from 'vue';

export function useFileDrop(
  target: () => HTMLDialogElement | null,
  onDrop: (files: File[]) => void,
  disabled: () => boolean,
) {
  const depth = ref(0);
  const dragging = computed(() => depth.value > 0 && !disabled());

  function isFileDrag(event: DragEvent) {
    return event.dataTransfer?.types.includes('Files') ?? false;
  }

  function inside(event: DragEvent) {
    const bounds = target()?.getBoundingClientRect();
    return (
      bounds &&
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom
    );
  }

  function reset() {
    depth.value = 0;
  }

  function enter(event: DragEvent) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    if (inside(event) && !disabled()) depth.value++;
    else reset();
  }

  function over(event: DragEvent) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    const accepted = inside(event) && !disabled();
    event.dataTransfer!.dropEffect = accepted ? 'copy' : 'none';
    if (accepted) depth.value = Math.max(1, depth.value);
    else reset();
  }

  function leave(event: DragEvent) {
    if (isFileDrag(event)) depth.value = Math.max(0, depth.value - 1);
  }

  function drop(event: DragEvent) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    reset();
    if (inside(event) && !disabled()) onDrop(Array.from(event.dataTransfer!.files));
  }

  function outside(event: DragEvent) {
    if (!target()?.open || event.defaultPrevented || !isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'none';
    reset();
  }

  return { dragging, enter, over, leave, drop, reset, outside };
}
