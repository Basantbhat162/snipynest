import test from "node:test";
import assert from "node:assert/strict";
import {
  boundedRectangle,
  imagePoint,
  trimUndoHistory,
  nextStepNumber,
} from "../src/annotation/geometry.ts";

test("crop clamps both endpoints before measuring even when dragged backwards outside the image", () => {
  assert.deepEqual(
    boundedRectangle({ x: 90, y: 80 }, { x: -20, y: -10 }, 100, 100),
    { x: 0, y: 0, width: 90, height: 80 },
  );
  assert.deepEqual(
    boundedRectangle({ x: -20, y: -10 }, { x: 200, y: 200 }, 100, 60),
    { x: 0, y: 0, width: 100, height: 60 },
  );
});
test("crop is integral and never extends beyond image bounds", () => {
  assert.deepEqual(
    boundedRectangle({ x: 0.5, y: 0.5 }, { x: 99.8, y: 59.8 }, 100, 60),
    { x: 0, y: 0, width: 100, height: 60 },
  );
});
test("pointer coordinates map display pixels to original resolution and clamp captured pointers", () => {
  assert.deepEqual(
    imagePoint(
      60,
      45,
      { left: 10, top: 20, width: 100, height: 50 },
      2000,
      1000,
    ),
    { x: 1000, y: 500 },
  );
  assert.deepEqual(
    imagePoint(
      -5,
      100,
      { left: 10, top: 20, width: 100, height: 50 },
      2000,
      1000,
    ),
    { x: 0, y: 1000 },
  );
});
test("undo pruning bakes oldest operations and bounds retained bytes", () => {
  const baked = [];
  const history = [{ size: 7 }, { size: 5 }, { size: 4 }];
  const result = trimUndoHistory(
    history,
    (action) => action.size,
    (action) => baked.push(action.size),
    10,
    100,
  );
  assert.deepEqual(baked, [7]);
  assert.deepEqual(
    result.map((action) => action.size),
    [5, 4],
  );
});
test("undo pruning handles a single oversized operation and count cap", () => {
  const baked = [];
  assert.deepEqual(
    trimUndoHistory(
      [{ size: 11 }],
      (x) => x.size,
      (x) => baked.push(x.size),
      10,
      10,
    ),
    [],
  );
  assert.deepEqual(baked, [11]);
  assert.equal(
    trimUndoHistory(
      [{ size: 1 }, { size: 1 }, { size: 1 }],
      (x) => x.size,
      () => {},
      10,
      2,
    ).length,
    2,
  );
});
test("step numbers follow remaining history after undo, including a baked baseline", () => {
  assert.equal(
    nextStepNumber([{ tool: "step", number: 3 }, { tool: "pen" }], 1),
    4,
  );
  assert.equal(nextStepNumber([{ tool: "pen" }], 3), 3);
  assert.equal(nextStepNumber([], 1), 1);
});
