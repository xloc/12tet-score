import { computed, ref } from 'vue';
import type { Point } from '../selection.ts';

export type SelectionDrag = {
  start: Point;
  end: Point;
  scope: 'box' | 'range';
  additive: boolean;
};

export function useDragSelection(
  pointFromEvent: (event: PointerEvent) => Point,
  select: (drag: SelectionDrag) => void,
  seek: (event: PointerEvent) => void,
) {
  const gesture = ref<SelectionDrag | null>(null);
  const drag = computed(() => {
    const value = gesture.value;
    return value && Math.hypot(value.end.x - value.start.x, value.end.y - value.start.y) >= 6
      ? value
      : null;
  });
  let pointer: { id: number; target: Element } | null = null;
  let ignoreClick = false;

  function start(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary || pointer) return;
    ignoreClick = false;
    if (event.metaKey) {
      event.preventDefault();
      ignoreClick = true;
      seek(event);
      return;
    }
    const point = pointFromEvent(event);
    gesture.value = {
      start: point,
      end: point,
      scope: event.altKey ? 'range' : 'box',
      additive: event.ctrlKey || event.shiftKey,
    };
    // Preserve the original tap target when a note is inside the gesture surface.
    const target = event.target as Element;
    pointer = { id: event.pointerId, target };
    target.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent) {
    if (pointer?.id !== event.pointerId || !gesture.value) return;
    gesture.value.end = pointFromEvent(event);
  }

  function cancel(event?: PointerEvent) {
    if (event && pointer?.id !== event.pointerId) return;
    if (gesture.value) ignoreClick = true;
    const previous = pointer;
    pointer = null;
    gesture.value = null;
    if (previous?.target.hasPointerCapture(previous.id)) {
      previous.target.releasePointerCapture(previous.id);
    }
  }

  function end(event: PointerEvent) {
    if (pointer?.id !== event.pointerId) return;
    move(event);
    const selection = drag.value;
    cancel();
    ignoreClick = !!selection;
    if (selection) {
      select(selection);
    }
  }

  function suppressClick(event: MouseEvent) {
    if (!ignoreClick || event.detail === 0) return;
    ignoreClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  return { drag, start, move, end, cancel, suppressClick };
}
