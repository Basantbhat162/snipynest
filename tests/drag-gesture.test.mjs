import test from "node:test";
import assert from "node:assert/strict";
import { createNativeDragGesture } from "../src/lib/dragGesture.ts";

function harness() {
  const captures = new Set();
  let starts = 0;
  const target = {
    setPointerCapture: (id) => captures.add(id),
    hasPointerCapture: (id) => captures.has(id),
    releasePointerCapture: (id) => captures.delete(id),
  };
  const gesture = createNativeDragGesture(() => {
    starts += 1;
  });
  const event = (pointerId = 1, x = 0, buttons = 1, button = 0) => ({
    pointerId,
    clientX: x,
    clientY: 0,
    buttons,
    button,
    currentTarget: target,
    stopPropagation() {},
    preventDefault() {},
  });
  return { gesture, event, captures, starts: () => starts };
}

test("holding a drag handle prevents browser text selection before native handoff", () => {
  const h = harness();
  let prevented = false;
  h.gesture.handlers.onPointerDown({ ...h.event(), preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});

test("deliberate held primary-button movement begins exactly one native drag and releases capture", () => {
  const h = harness();
  h.gesture.handlers.onPointerDown(h.event());
  h.gesture.handlers.onPointerMove(h.event(1, 5));
  assert.equal(h.starts(), 0);
  h.gesture.handlers.onPointerMove(h.event(1, 6));
  h.gesture.handlers.onPointerMove(h.event(1, 12));
  assert.equal(h.starts(), 1);
  assert.equal(h.captures.size, 0);
});
test("a second pointer cannot replace, move, or cancel the owning gesture", () => {
  const h = harness();
  h.gesture.handlers.onPointerDown(h.event(1));
  h.gesture.handlers.onPointerDown(h.event(2, 100));
  h.gesture.handlers.onPointerMove(h.event(2, 200));
  h.gesture.handlers.onPointerUp(h.event(2));
  h.gesture.handlers.onPointerCancel(h.event(2));
  h.gesture.handlers.onLostPointerCapture(h.event(2));
  assert.equal(h.starts(), 0);
  assert.deepEqual([...h.captures], [1]);
  h.gesture.handlers.onPointerMove(h.event(1, 7));
  assert.equal(h.starts(), 1);
});
test("release, cancellation, lost capture, and blur cancellation end the gesture and allow a fresh drag", () => {
  for (const end of [
    "onPointerUp",
    "onPointerCancel",
    "onLostPointerCapture",
    "cancel",
  ]) {
    const h = harness();
    h.gesture.handlers.onPointerDown(h.event());
    if (end === "cancel") h.gesture.cancel();
    else h.gesture.handlers[end](h.event());
    h.gesture.handlers.onPointerMove(h.event(1, 50));
    assert.equal(h.starts(), 0, end);
    assert.equal(h.captures.size, 0, end);
    h.gesture.handlers.onPointerDown(h.event(3));
    h.gesture.handlers.onPointerMove(h.event(3, 9));
    assert.equal(h.starts(), 1, end);
  }
});
test("movement without the held left button and non-primary presses cannot start a native drag", () => {
  const h = harness();
  h.gesture.handlers.onPointerDown(h.event(1, 0, 2, 2));
  h.gesture.handlers.onPointerMove(h.event(1, 20, 2));
  h.gesture.handlers.onPointerDown(h.event());
  h.gesture.handlers.onPointerMove(h.event(1, 20, 0));
  h.gesture.handlers.onPointerMove(h.event(1, 50, 1));
  assert.equal(h.starts(), 0);
  assert.equal(h.captures.size, 0);
});
test("HTML drag payloads are prevented and no clipboard or path is synthesized by the gesture", () => {
  const h = harness();
  let prevented = false;
  h.gesture.handlers.onDragStart({
    preventDefault() {
      prevented = true;
    },
    dataTransfer: {
      setData() {
        assert.fail("HTML drag must not export filesystem paths");
      },
    },
  });
  assert.equal(prevented, true);
  assert.equal(h.starts(), 0);
});
