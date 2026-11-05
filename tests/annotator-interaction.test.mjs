import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as cropGeometry from "../src/annotation/crop.ts";
import * as geometry from "../src/annotation/geometry.ts";
import * as regionLayout from "../src/annotation/region-layout.ts";

// Run the production component and its handlers. Canvas drawing and native IPC
// are adapters; document pixel correctness has its own production-document tests.
const compiled = ts.transpileModule(readFileSync(new URL("../src/components/AnnotatorModal.tsx", import.meta.url), "utf8"), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022},
}).outputText;

function editorHarness(quickCrop = false, regionCapture) {
  const slots = [];
  let cursor = 0, tree, loads = [], listeners = [];
  let copied = 0, closed = 0, saved = 0, exportedCrop;
  const nativeCalls = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => {slots[index] = typeof value === "function" ? value(slots[index]) : value;}];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ?? (slots[index] = {current: initial});
    },
    useEffect(effect, deps) {
      if (deps === undefined) listeners.push(effect);
      if (deps?.[0] === "fixture") {
        const index = cursor++;
        if (!slots[index]) { slots[index] = true; loads.push(effect); }
      }
    },
    useLayoutEffect() {},
  };
  const jsx = (type, props) => ({type, props});
  class TestDocument {
    canvas = {width: 100, height: 80};
    canUndo = false;
    canRedo = false;
    exportPng(crop) { exportedCrop = crop; return "synthetic-png"; }
    dispose() {}
  }
  const modules = {
    react: hooks,
    "react/jsx-runtime": {jsx, jsxs: jsx, Fragment: "fragment"},
    "@tauri-apps/api/event": {listen: async () => () => {}},
    "@tauri-apps/api/core": {invoke: async (name, args) => { nativeCalls.push({name, args}); return "data:fixture"; }},
    "../annotation/drafts": {readDraft: async () => null, saveDraft: async () => {}, discardDraft: async () => {}},
    "../annotation/document": {AnnotationDocument: TestDocument},
    "../annotation/crop": cropGeometry,
    "../annotation/geometry": geometry,
    "../annotation/region-layout": regionLayout,
    "./RegionToolbar": {RegionToolbar: function RegionToolbar() {}},
    "lucide-react": new Proxy({}, {get: (_target, name) => name}),
    "./Annotator.css": {},
  };
  const exports = {};
  new Function("require", "exports", compiled)(name => {
    assert.ok(name in modules, `Unexpected module ${name}`);
    return modules[name];
  }, exports);
  const render = () => {
    cursor = 0;
    listeners = [];
    tree = exports.AnnotatorModal({quickCrop, regionCapture, clip: {id: "fixture"}, onClose: () => {closed++;}, onSave: async () => {saved++;}, onCopyResult: async () => {copied++;}});
    return tree;
  };
  const nodes = () => {
    const found = [];
    function walk(node) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {node.forEach(walk); return;}
      found.push(node);
      walk(node.props?.children);
    }
    walk(tree);
    return found;
  };
  const find = predicate => nodes().find(predicate);
  const button = label => find(node => node.type === "button" && (node.props["aria-label"] === label || node.props.children === label));
  const crop = () => find(node => node.props?.className === "annotator-crop");
  render();
  return {render, nodes, find, button, crop, nativeCalls,
    key(key, edge, shiftKey = false, ctrlKey = false) {
      const previousWindow = globalThis.window, previousElement = globalThis.HTMLElement;
      const handlers = new Map();
      class Element {dataset = edge ? {edge} : {}; tagName = edge ? "BUTTON" : "DIV"; closest() {return edge ? this : null;} }
      globalThis.HTMLElement = Element;
      globalThis.window = {addEventListener: (name, handler) => handlers.set(name, handler), removeEventListener() {}};
      const cleanups = listeners.map(effect => effect());
      try { handlers.get("keydown")({key, code:key, target:new Element(), shiftKey, ctrlKey, metaKey:false, preventDefault(){},stopImmediatePropagation(){}}); }
      finally {cleanups.forEach(cleanup=>cleanup?.()); globalThis.window=previousWindow;globalThis.HTMLElement=previousElement;}
    },
    get copied() {return copied;}, get closed() {return closed;}, get saved() {return saved;}, get exportedCrop() {return exportedCrop;},
    async load() {
      const OriginalImage = globalThis.Image;
      globalThis.Image = class {width = 100; height = 80; set src(value) {if (value) queueMicrotask(() => this.onload());}};
      try {loads.forEach(effect => effect()); await new Promise(resolve => setImmediate(resolve)); render();}
      finally {globalThis.Image = OriginalImage;}
    },
  };
}

function pointer(target, pointerId = 1, clientX = 0, clientY = 0) {
  const captured = new Set();
  const host = {
    setPointerCapture(id) {captured.add(id);},
    hasPointerCapture(id) {return captured.has(id);},
    releasePointerCapture(id) {captured.delete(id);},
  };
  return {button: 0, pointerId, clientX, clientY, preventDefault() {}, stopPropagation() {},
    target: {dataset: target, closest: () => ({focus() {}})}, currentTarget: host};
}
test("right clicking area capture offers a keyboard accessible Cancel action",async()=>{
 const editor=editorHarness(true,{id:"region",image:"data:fixture"});await editor.load();
 editor.find(n=>n.props?.role==="dialog").props.onContextMenu({clientX:15,clientY:20,preventDefault(){}});editor.render();
 const cancel=editor.find(n=>n.props?.role==="menuitem");assert.ok(cancel);
 cancel.props.onClick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(editor.closed,1);assert.ok(editor.nativeCalls.some(call=>call.name==="cancel_region_capture"));
});

test("opening Crop starts with a full-image adjustable guide and eight resize targets", async () => {
  const editor = editorHarness();
  await editor.load();
  const cropTool = editor.find(node => node.type === "button" && node.props.children?.[1]?.props?.children === "Crop");
  assert.equal(cropTool.props["aria-pressed"], true);
  assert.ok(editor.crop());
  assert.equal(editor.nodes().filter(node => node.props?.className?.startsWith("crop-handle ")).length, 8);
  assert.ok(editor.button("Resize crop left edge"));
  assert.equal(editor.button("Adjust edges").props["aria-pressed"], true);
});

test("Ctrl plus and minus zoom the image and Ctrl zero restores Fit", async () => {
  const editor = editorHarness(true);
  await editor.load();
  const fitWidth = editor.crop().props.style.width;
  editor.key("+", undefined, true, true); editor.render();
  const enlarged = editor.crop().props.style.width;
  assert.ok(enlarged > fitWidth, "Ctrl+plus must magnify the image");
  editor.key("-", undefined, false, true); editor.render();
  assert.ok(editor.crop().props.style.width < enlarged);
  editor.key("0", undefined, false, true); editor.render();
  assert.equal(editor.crop().props.style.width, fitWidth);
});

test("Draw area clears the guide and Adjust edges restores it", async () => {
  const editor = editorHarness();
  await editor.load();
  editor.button("Draw area").props.onClick(); editor.render();
  assert.equal(editor.crop(), undefined);
  editor.button("Adjust edges").props.onClick(); editor.render();
  assert.ok(editor.crop());
});

test("dragging the left edge resizes instead of moving the rectangle", async () => {
  const editor = editorHarness();
  await editor.load();
  const overlay = editor.crop();
  const scale = overlay.props.style.width / 100;
  const down = pointer({edge: "w"});
  overlay.props.onPointerDown(down);
  overlay.props.onPointerMove({...down, clientX: 20 * scale}); editor.render();
  const next = editor.crop().props.style;
  assert.ok(Math.abs(next.left - 20 * scale) < 0.00001);
  assert.ok(Math.abs(next.width - 80 * scale) < 0.00001);
  assert.equal(next.top, 0);
  assert.equal(next.height, overlay.props.style.height);
  editor.crop().props.onPointerUp({...down, clientX: 20 * scale});
});

test("cancelled resize restores crop and a second pointer cannot steal the drag", async () => {
  const editor = editorHarness();
  await editor.load();
  const original = editor.crop().props.style;
  const down = pointer({edge: "w"});
  editor.crop().props.onPointerDown(down);
  editor.crop().props.onPointerDown(pointer({edge: "e"}, 2));
  editor.crop().props.onPointerMove({...down, pointerId: 2, clientX: 100}); editor.render();
  assert.deepEqual(editor.crop().props.style, original);
  editor.crop().props.onPointerMove({...down, clientX: 0.2}); editor.render();
  assert.notDeepEqual(editor.crop().props.style, original);
  editor.crop().props.onPointerCancel(); editor.render();
  assert.deepEqual(editor.crop().props.style, original);
  editor.crop().props.onPointerDown(down);
  editor.crop().props.onPointerMove({...down, clientX: 0.1}); editor.render();
  assert.notDeepEqual(editor.crop().props.style, original);
});

test("unchanged initial crop does not prompt to save when closing", async () => {
  const editor = editorHarness();
  await editor.load();
  editor.button("Close image editor").props.onClick();
  await new Promise(resolve => setImmediate(resolve)); editor.render();
  assert.equal(editor.closed, 1);
  assert.deepEqual(editor.nativeCalls.at(-1), {name: "set_editor_mode", args: {mode: "inline"}});
});

test("returning to Crop from Pen restores the adjustable full-image guide", async () => {
  const editor = editorHarness();
  await editor.load();
  const tool = label => editor.find(node => node.type === "button" && node.props.children?.[1]?.props?.children === label);
  tool("Pen").props.onClick(); editor.render();
  assert.equal(editor.crop(), undefined);
  tool("Crop").props.onClick(); editor.render();
  assert.ok(editor.crop());
});

test("keyboard focused edge resizes by one or ten image pixels and Escape cancels a gesture", async () => {
  const editor = editorHarness();
  await editor.load();
  const scale = editor.crop().props.style.width / 100;
  editor.key("ArrowRight", "w"); editor.render();
  assert.equal(editor.crop().props.style.left, scale);
  editor.key("ArrowRight", "w", true); editor.render();
  assert.equal(editor.crop().props.style.left, 11 * scale);
  const before = editor.crop().props.style;
  const down = pointer({edge:"w"});
  editor.crop().props.onPointerDown(down);
  editor.crop().props.onPointerMove({...down,clientX:20*scale}); editor.render();
  editor.key("Escape"); editor.render();
  assert.deepEqual(editor.crop().props.style, before);
});

test("the initial guide does not disable Copy or Save until the crop changes", async () => {
  const editor = editorHarness();
  await editor.load();
  const action = label => editor.find(node => node.type === "button" && node.props.children?.[1] === label);
  assert.equal(action("Copy image").props.disabled, false);
  assert.equal(action("Save image").props.disabled, false);
  const down = pointer({edge: "w"});
  editor.crop().props.onPointerDown(down);
  editor.crop().props.onPointerUp({...down, clientX: 0.2}); editor.render();
  assert.equal(action("Copy image").props.disabled, true);
});

test("Quick crop copies the pending selection with Ctrl+C and saves with Ctrl+S", async () => {
  const waitFor=async(predicate)=>{
    const deadline=Date.now()+2000;
    while(!predicate()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,1));
    assert.ok(predicate(),"Export did not finish within the test deadline");
  };
  const previous = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
  try {
    const editor = editorHarness(true); await editor.load();
    editor.key("ArrowRight", "w", true); editor.render();
    const action = label => editor.find(node => node.type === "button" && node.props.children?.[1] === label);
    assert.equal(action("Copy image").props.disabled, false);
    editor.key("c", undefined, false, true);
    await waitFor(()=>editor.copied===1); editor.render();
    assert.equal(editor.copied, 1);
    assert.deepEqual(editor.exportedCrop, {x:10,y:0,width:90,height:80});
    assert.equal(editor.saved, 0); assert.equal(editor.closed, 0);
    editor.key("s", undefined, false, true);
    await waitFor(()=>editor.closed===1); editor.render();
    assert.equal(editor.saved, 1); assert.equal(editor.closed, 1);
  } finally { globalThis.requestAnimationFrame = previous; }
});

test("Quick crop closes with Escape without a discard prompt", async () => {
  const editor = editorHarness(true); await editor.load();
  editor.key("ArrowRight", "w"); editor.render();
  editor.key("Escape"); await new Promise(resolve => setImmediate(resolve)); editor.render();
  assert.equal(editor.closed, 1);
  assert.equal(editor.find(node=>node.props?.role === "alertdialog"), undefined);
});

test("Quick crop exposes markup tools and keeps its pending crop when switching tools", async () => {
  const editor = editorHarness(true); await editor.load();
  const tool = label => editor.find(node => node.type === "button" && node.props.children?.[1]?.props?.children === label);
  for (const label of ["Crop", "Pen", "Arrow", "Line", "Box", "Ellipse", "Highlight", "Redact", "Text", "Step", "Pan"])
    assert.ok(tool(label), `Quick crop must offer ${label}`);
  editor.key("ArrowRight", "w", true); editor.render();
  const selection = editor.crop().props.style;
  tool("Pen").props.onClick(); editor.render();
  assert.equal(editor.crop(), undefined, "The crop overlay must not intercept drawing");
  tool("Crop").props.onClick(); editor.render();
  assert.deepEqual(editor.crop().props.style, selection, "Switching tools must keep the export selection");
});

test("Save PDF exports the pending crop without Apply crop", async () => {
  const original = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
  try {
    const editor = editorHarness(); await editor.load();
    editor.key("ArrowRight", "w", true); editor.render();
    const pdf = editor.find(node => node.type === "button" && node.props.children?.[1] === "Save PDF");
    assert.equal(pdf.props.disabled, false);
    editor.key("p", undefined, false, true);
    const deadline = Date.now() + 2000;
    while (!editor.closed && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(editor.closed, 1);
    assert.deepEqual(editor.exportedCrop, {x: 10, y: 0, width: 90, height: 80});
    assert.ok(editor.nativeCalls.some(call => call.name === "save_image_pdf"));
    assert.equal(editor.saved, 0, "PDF export must not also save a PNG clip");
  } finally { globalThis.requestAnimationFrame = original; }
});

test("area capture begins without a selection or clipboard write and Escape cancels it", async () => {
  const editor = editorHarness(true, {id: "area-fixture", image: "data:fixture"});
  await editor.load();
  assert.equal(editor.crop(), undefined);
  assert.equal(editor.copied, 0);
  editor.key("c", undefined, false, true);
  assert.equal(editor.copied, 0, "No selection must never copy the entire monitor");
  editor.key("Escape"); await new Promise(resolve => setImmediate(resolve));
  assert.equal(editor.closed, 1);
  assert.deepEqual(editor.nativeCalls.at(-1), {name: "cancel_region_capture", args: {id: "area-fixture"}});
});

test("area capture does not render the full editor panel or footer", async () => {
  const editor = editorHarness(true, {id: "area-fixture", image: "data:fixture"});
  await editor.load();
  assert.equal(editor.find(node => node.props?.className === "annotator-controls"), undefined,
    "Area capture must use selection-attached tool strips, not the full editor panel");
  assert.equal(editor.find(node => node.props?.className === "annotator-footer"), undefined);
  assert.ok(editor.find(node => node.props?.id === "annotator-title"), "The capture still needs an accessible dialog name");
});
