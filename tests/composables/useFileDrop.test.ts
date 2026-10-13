import { expect, test, vi } from 'vite-plus/test';
import { ref } from 'vue';
import { useFileDrop } from '../../src/composables/useFileDrop';

function fixture() {
  const dialog = {
    open: true,
    getBoundingClientRect: () => ({ left: 20, top: 20, right: 300, bottom: 200 }),
  };
  const loading = ref(false);
  const onDrop = vi.fn();
  const fileDrop = useFileDrop(
    () => dialog as unknown as HTMLDialogElement,
    onDrop,
    () => loading.value,
  );
  function event({ x = 40, y = 40, files = [] as File[], types = ['Files'] } = {}) {
    const value = new Event('dragover', { cancelable: true }) as DragEvent;
    Object.defineProperties(value, {
      clientX: { value: x },
      clientY: { value: y },
      dataTransfer: { value: { types, files, dropEffect: 'none' } },
    });
    return value;
  }
  return { ...fileDrop, event, dialog, loading, onDrop };
}

test('moving across nested dialog elements keeps the drop highlight active until the final leave', () => {
  const zone = fixture();
  zone.enter(zone.event());
  zone.enter(zone.event());
  zone.leave(zone.event());
  expect(zone.dragging.value).toBe(true);
  const over = zone.event();
  zone.over(over);
  expect(over.defaultPrevented).toBe(true);
  expect(over.dataTransfer!.dropEffect).toBe('copy');
  zone.outside(over);
  expect(zone.dragging.value).toBe(true);
  zone.leave(zone.event());
  expect(zone.dragging.value).toBe(false);
  zone.leave(zone.event());
  zone.enter(zone.event());
  expect(zone.dragging.value).toBe(true);
});

test('dropping inside the dialog loads the actual File objects and clears the highlight', () => {
  const zone = fixture();
  const file = new File(['{}'], 'piece.json');
  zone.enter(zone.event());
  const drop = zone.event({ files: [file] });
  zone.drop(drop);
  expect(drop.defaultPrevented).toBe(true);
  expect(zone.onDrop).toHaveBeenCalledOnce();
  expect(zone.onDrop).toHaveBeenCalledWith([file]);
  expect(zone.dragging.value).toBe(false);
});

test('the dialog backdrop rejects files and prevents browser navigation', () => {
  const zone = fixture();
  zone.enter(zone.event());
  const backdrop = zone.event({ x: 10, files: [new File(['{}'], 'piece.json')] });
  zone.over(backdrop);
  expect(zone.dragging.value).toBe(false);
  expect(backdrop.dataTransfer!.dropEffect).toBe('none');
  zone.drop(backdrop);
  expect(backdrop.defaultPrevented).toBe(true);
  expect(zone.onDrop).not.toHaveBeenCalled();
});

test('loading blocks a second drop and removes the active drop highlight', () => {
  const zone = fixture();
  zone.enter(zone.event());
  zone.loading.value = true;
  expect(zone.dragging.value).toBe(false);
  const busy = zone.event({ files: [new File(['{}'], 'piece.json')] });
  zone.over(busy);
  expect(busy.dataTransfer!.dropEffect).toBe('none');
  zone.drop(busy);
  zone.loading.value = false;
  expect(zone.dragging.value).toBe(false);
  expect(zone.onDrop).not.toHaveBeenCalled();
});

test('dragging text or links preserves normal input behavior', () => {
  const zone = fixture();
  const text = zone.event({ types: ['text/plain'] });
  zone.enter(text);
  zone.over(text);
  zone.leave(text);
  zone.drop(text);
  zone.outside(text);
  expect(text.defaultPrevented).toBe(false);
  expect(zone.dragging.value).toBe(false);
  expect(zone.onDrop).not.toHaveBeenCalled();
});

test('page drops are blocked only while the dialog is open and reset the drop state', () => {
  const zone = fixture();
  zone.enter(zone.event());
  const outside = zone.event({ x: 400 });
  zone.outside(outside);
  expect(outside.defaultPrevented).toBe(true);
  expect(outside.dataTransfer!.dropEffect).toBe('none');
  expect(zone.dragging.value).toBe(false);
  zone.dialog.open = false;
  const closed = zone.event({ x: 400 });
  zone.outside(closed);
  expect(closed.defaultPrevented).toBe(false);
});

test('closing the dialog clears an unfinished drag before it is opened again', () => {
  const zone = fixture();
  zone.enter(zone.event());
  zone.enter(zone.event());
  zone.reset();
  zone.enter(zone.event());
  zone.leave(zone.event());
  expect(zone.dragging.value).toBe(false);
});
