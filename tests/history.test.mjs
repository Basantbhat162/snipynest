import test from "node:test";
import assert from "node:assert/strict";
import { HistoryController } from "../src/lib/history.ts";
const clip = (id) => ({ id });
test("late query cannot overwrite a newer category or search", async () => {
  const pending = [];
  const h = new HistoryController(
    (filter) => new Promise((resolve) => pending.push({ filter, resolve })),
  );
  const old = h.load("all", "old", 0);
  const next = h.load("image", "new", 0);
  pending[1].resolve([clip("new")]);
  await next;
  pending[0].resolve([clip("old")]);
  await old;
  assert.equal(h.snapshot.clips[0].id, "new");
  assert.equal(h.snapshot.loading, false);
});
test("page size stays bounded and next-page detection uses one lookahead", async () => {
  let request;
  const h = new HistoryController(async (filter) => {
    request = filter;
    return Array.from({ length: 101 }, (_, i) => clip(String(i)));
  });
  await h.load("all", "", 2);
  assert.equal(request.offset, 200);
  assert.equal(request.limit, 101);
  assert.equal(h.snapshot.clips.length, 100);
  assert.equal(h.snapshot.hasNext, true);
});
test("failed navigation clears stale items and exposes retryable error", async () => {
  const h = new HistoryController(async () => {
    throw new Error("Database unavailable");
  });
  await h.load("trash", "", 0);
  assert.deepEqual(h.snapshot.clips, []);
  assert.equal(h.snapshot.error, "Database unavailable");
  assert.equal(h.snapshot.loading, false);
});
test("empty and final pages have no next page; filters reflect current view", async () => {
  let request;
  const h = new HistoryController(async (filter) => {
    request = filter;
    return [];
  });
  await h.load("pinned", " hello ", 0);
  assert.equal(request.pinned_only, true);
  assert.equal(request.search, "hello");
  assert.equal(request.trash_only, false);
  assert.equal(h.snapshot.hasNext, false);
  await h.load("trash", "", 0);
  assert.equal(request.trash_only, true);
  assert.equal(request.search, undefined);
});
