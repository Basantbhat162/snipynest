import test from "node:test";
import assert from "node:assert/strict";
import { selectionAfterDrop, selectRange } from "../src/lib/selection.ts";
test("Shift checkbox selects the inclusive range in either direction and can clear it", () => {
 const ids = ["a","b","c","d","e"];
 assert.deepEqual([...selectRange(new Set(["d"]), ids, "d", "b", true)].sort(), ["b","c","d"]);
 assert.deepEqual([...selectRange(new Set(["a","e"]), ids, "a", "d", true)].sort(), ids);
 assert.deepEqual([...selectRange(new Set(ids), ids, "a", "d", false)], ["e"]);
 assert.deepEqual([...selectRange(new Set(), ids, "missing", "c", true)], ["c"]);
});
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
