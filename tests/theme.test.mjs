import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../extension/theme.js", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(initial = null, fail = false) {
  const events = {}, controlEvents = {}, root = { dataset: {} }, status = { textContent: "" };
  const control = { value: "", addEventListener: (name, fn) => controlEvents[name] = fn };
  const storage = { value: initial, getItem() { return this.value; }, setItem(key, value) { if (fail) throw Error("Denied"); this.value = value; } };
  const document = { documentElement: root, readyState: "complete", querySelectorAll: () => [control], getElementById: () => status };
  const api = {};
  new Function("exports", "window", "document", "localStorage", source)(api, { addEventListener: (name, fn) => events[name] = fn }, document, storage);
  return { api, events, control, status, storage, root, change(value) { control.value = value; controlEvents.change(); } };
}
test("theme restores a saved choice and changes immediately without changing image data", () => {
  const f = fixture("dark");
  assert.equal(f.root.dataset.theme, "dark");
  let calls = 0;
  const unsubscribe = f.api.subscribeTheme(() => calls++);
  f.api.setTheme("light");
  assert.equal(f.root.dataset.theme, "light");
  assert.equal(f.storage.value, "light");
  assert.equal(f.control.value, "light");
  assert.equal(calls, 1);
  unsubscribe();
  f.api.setTheme("dark");
  assert.equal(calls, 1);
  assert.equal(fixture(f.storage.value).api.getTheme(), "dark");
});
test("theme updates open sibling windows, ignores other storage and validates values", () => {
  const f = fixture("invalid");
  assert.equal(f.api.getTheme(), "light");
  f.events.storage({key: "snipynest.theme", newValue: "dark", storageArea: f.storage});
  assert.equal(f.api.getTheme(), "dark");
  f.events.storage({key: "snipynest.theme", newValue: "light", storageArea: {}});
  assert.equal(f.api.getTheme(), "dark");
  f.api.setTheme("system");
  assert.equal(f.api.getTheme(), "dark");
  f.events.storage({key: null, newValue: null, storageArea: f.storage});
  assert.equal(f.api.getTheme(), "light");
});
test("extension theme selector persists and reports storage failure without claiming success", () => {
  const f = fixture();
  f.change("dark");
  assert.equal(f.storage.value, "dark");
  const blocked = fixture("dark", true);
  blocked.change("light");
  assert.equal(blocked.control.value, "dark");
  assert.equal(blocked.api.getTheme(), "dark");
  assert.match(blocked.status.textContent, /Could not save/);
});
