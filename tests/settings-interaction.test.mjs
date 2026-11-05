import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../src/components/HousekeepingModal.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(save) {
  const slots = [], effects = [];
  let cursor = 0, tree;
  const hooks = {
    useRef(initial) { const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index]; },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useEffect(fn, dependencies) {
      const index = cursor++;
      if (!slots[index] || dependencies.some((value, i) => value !== slots[index][i])) effects.push(fn);
      slots[index] = dependencies;
    },
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: hooks,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@tauri-apps/api/core": { invoke: async () => {} },
    "lucide-react": { HardDrive: "icon", Trash2: "icon" },
    "../lib/format": { formatBytes: String },
    "./Dialog": { Dialog: "dialog" },
    "./ThemeChoice": { ThemeChoice: "theme-choice" },
    "./KeyboardSettings": { KeyboardSettings: "keyboard-settings" },
  };
  const exports = {};
  new Function("require", "exports", compiled)(name => {
    assert.ok(name in modules, name);
    return modules[name];
  }, exports);
  const preferences = { capturePaused: false, startAtLogin: false, trashRetentionDays: 30, snipShortcut: "Ctrl+Alt+Q", historyShortcut: "Ctrl+Alt+V", quickCaptureShortcut: "Ctrl+Alt+A" };
  const render = () => {
    cursor = 0;
    tree = exports.HousekeepingModal({ preferences, stats: null, onPreferencesChange: save, onClose() {}, onEmptyTrash: async () => {} });
    effects.splice(0).forEach(effect => effect());
  };
  const nodes = () => {
    const results = [];
    const walk = node => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") { results.push(node); walk(node.props?.children); }
    };
    walk(tree);
    return results;
  };
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  render();
  return { render, nodes, flush, submit() { nodes().find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); } };
}

test("resetting shortcuts after saving clears the saved acknowledgement and persists the defaults on the next save", async () => {
  const saves = [];
  const form = fixture(async value => { saves.push(value); });
  form.submit();
  await form.flush();
  assert.ok(form.nodes().some(node => node.props?.role === "status" && node.props.children === "Settings saved"));
  form.nodes().find(node => node.type === "button" && node.props.children === "Reset shortcuts").props.onClick();
  form.render();
  assert.ok(!form.nodes().some(node => node.props?.role === "status" && node.props.children === "Settings saved"));
  assert.equal(saves.length, 1, "reset edits the draft without prematurely saving");
  form.submit();
  await form.flush();
  assert.equal(saves[1].snipShortcut, "Ctrl+Shift+S");
  assert.equal(saves[1].historyShortcut, "Ctrl+Shift+V");
  assert.equal(saves[1].quickCaptureShortcut, "Ctrl+Alt+S");
});

test("pending settings saves prevent further edits until the saved draft is acknowledged", async () => {
  let finish;
  const form = fixture(() => new Promise(resolve => { finish = resolve; }));
  form.submit();
  form.render();
  const groups = form.nodes().filter(node => node.type === "fieldset");
  assert.ok(groups.length > 0);
  assert.ok(groups.every(group => group.props.disabled === true));
  finish();
  await form.flush();
  assert.ok(form.nodes().filter(node => node.type === "fieldset").every(group => group.props.disabled === false));
});
