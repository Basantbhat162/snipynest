import test from "node:test";
import assert from "node:assert/strict";
import { selectionAfterDrop } from "../src/lib/selection.ts";
test("successful drop clears only transferred items", () => {
 const selected = new Set(["a", "b", "c"]);
 assert.deepEqual([...selectionAfterDrop(selected, selected, ["a", "b"], true)], ["c"]);
 assert.deepEqual([...selected], ["a", "b", "c"]);
});
test("cancelled drop and a selection changed during drag are preserved", () => {
 const started = new Set(["a", "b"]), current = new Set(["c"]);
 assert.equal(selectionAfterDrop(started, started, ["a", "b"], false), started);
 assert.equal(selectionAfterDrop(current, started, ["a", "b"], true), current);
});
