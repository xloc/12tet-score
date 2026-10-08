import assert from 'node:assert/strict';
import { test } from 'vite-plus/test';
import { useDragSelection, type SelectionDrag } from './useDragSelection.ts';

function fixture(pointerType: string = 'mouse') {
  const captured = new Set<number>();
  const target = {
    setPointerCapture: (id: number) => captured.add(id),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => captured.delete(id),
  };
  const committed: SelectionDrag[] = [];
  const selection = useDragSelection(
    (event) => ({ x: event.clientX, y: event.clientY }),
    (drag) => committed.push(drag),
  );
  function event(x: number, y: number, overrides: Partial<PointerEvent> = {}) {
    return {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType,
      isPrimary: true,
      button: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      target,
      currentTarget: {},
      ...overrides,
    } as unknown as PointerEvent;
  }
  return { ...selection, event, committed, captured, target };
}

test('taps capture the original note target and do not turn into box selections', () => {
  const selection = fixture('touch');
  selection.start(selection.event(20, 20));
  assert(selection.captured.has(1));
  selection.move(selection.event(22, 23));
  assert.equal(selection.drag.value, null);
  selection.end(selection.event(22, 23));
  assert.equal(selection.committed.length, 0);
  assert.equal(selection.captured.size, 0);
});

for (const pointerType of ['mouse', 'touch', 'pen']) {
  test(`${pointerType} commits the same directional drag and releases capture`, () => {
    const selection = fixture(pointerType);
    selection.start(selection.event(60, 20));
    selection.move(selection.event(20, 60));
    assert.equal(selection.drag.value?.end.x, 20);
    selection.end(selection.event(15, 65));
    assert.deepEqual(selection.committed, [
      {
        start: { x: 60, y: 20 },
        end: { x: 15, y: 65 },
        scope: 'box',
        additive: false,
      },
    ]);
    assert.equal(selection.drag.value, null);
    assert.equal(selection.captured.size, 0);
  });
}

test('holding Alt starts a time range and preserves additive selection modifiers', () => {
  const selection = fixture();
  selection.start(selection.event(20, 20, { altKey: true, metaKey: true }));
  selection.end(selection.event(60, 20));
  assert.equal(selection.committed[0]?.scope, 'range');
  assert.equal(selection.committed[0]?.additive, true);
});

test('Ctrl, Command, and Shift keep normal drags as additive note selections', () => {
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
    const selection = fixture();
    selection.start(selection.event(20, 20, modifiers));
    selection.end(selection.event(60, 60));
    assert.equal(selection.committed[0]?.scope, 'box');
    assert.equal(selection.committed[0]?.additive, true);
  }
});

test('a canceled touch or lost pointer capture never commits selection', () => {
  const selection = fixture('touch');
  selection.start(selection.event(20, 20));
  selection.move(selection.event(60, 60));
  selection.cancel(selection.event(60, 60));
  selection.end(selection.event(60, 60));
  assert.equal(selection.committed.length, 0);
  assert.equal(selection.drag.value, null);
  assert.equal(selection.captured.size, 0);
  selection.start(selection.event(20, 20));
  selection.target.releasePointerCapture(1);
  selection.cancel(selection.event(20, 20));
  assert.equal(selection.committed.length, 0);
});

test('secondary pointers and non-primary buttons cannot replace an active gesture', () => {
  const selection = fixture('touch');
  selection.start(selection.event(20, 20, { button: 2 }));
  assert.equal(selection.captured.size, 0);
  selection.start(selection.event(20, 20));
  const secondary = selection.event(60, 60, { pointerId: 2, isPrimary: false, altKey: true });
  selection.start(secondary);
  selection.move(secondary);
  selection.end(secondary);
  selection.cancel(secondary);
  assert.equal(selection.captured.size, 1);
  selection.end(selection.event(40, 40));
  assert.equal(selection.committed[0]?.scope, 'box');
  assert.deepEqual(selection.committed[0]?.end, { x: 40, y: 40 });
});

test('a drag suppresses the following pointer click while preserving keyboard activation', () => {
  const selection = fixture();
  selection.start(selection.event(20, 20));
  selection.end(selection.event(60, 60));
  let prevented = 0;
  let stopped = 0;
  const click = {
    detail: 0,
    preventDefault: () => prevented++,
    stopPropagation: () => stopped++,
  };
  selection.suppressClick(click as unknown as MouseEvent);
  assert.equal(prevented, 0);
  click.detail = 1;
  selection.suppressClick(click as unknown as MouseEvent);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
  selection.suppressClick(click as unknown as MouseEvent);
  assert.equal(prevented, 1);
});

test('canceling an active gesture also suppresses its eventual click', () => {
  const selection = fixture();
  selection.start(selection.event(20, 20));
  selection.cancel();
  selection.end(selection.event(20, 20));
  let prevented = false;
  selection.suppressClick({
    detail: 1,
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {},
  } as unknown as MouseEvent);
  assert(prevented);
  assert.equal(selection.committed.length, 0);
});
