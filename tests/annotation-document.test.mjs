import test from "node:test";
import assert from "node:assert/strict";
import { AnnotationDocument } from "../src/annotation/document.ts";

// A small pixel canvas adapter keeps the document seam testable without a GPU.
class PixelCanvas {
  #width = 0;
  #height = 0;
  pixels = [];
  get width() {
    return this.#width;
  }
  set width(value) {
    this.#width = value;
    this.reset();
  }
  get height() {
    return this.#height;
  }
  set height(value) {
    this.#height = value;
    this.reset();
  }
  reset() {
    this.pixels = Array(this.#width * this.#height).fill("clear");
  }
  getContext() {
    const canvas = this;
    return {
      canvas,
      fillStyle: "",
      save() {},
      restore() {},
      drawImage(source) {
        canvas.pixels = [...source.pixels];
      },
      fillRect(x, y, width, height) {
        for (let row = y; row < y + height; row++)
          for (let column = x; column < x + width; column++)
            canvas.pixels[row * canvas.width + column] = this.fillStyle;
      },
      getImageData(x, y, width, height) {
        const pixels = [];
        for (let row = y; row < y + height; row++)
          pixels.push(
            ...canvas.pixels.slice(
              row * canvas.width + x,
              row * canvas.width + x + width,
            ),
          );
        return { pixels, width, height };
      },
      putImageData(data) {
        canvas.pixels = [...data.pixels];
      },
    };
  }
  toDataURL() {
    return JSON.stringify({
      width: this.width,
      height: this.height,
      pixels: this.pixels,
    });
  }
}
globalThis.document = { createElement: () => new PixelCanvas() };
const image = () => ({
  naturalWidth: 4,
  naturalHeight: 3,
  pixels: Array.from({ length: 12 }, (_, index) => `p${index}`),
});
const crop = {
  tool: "crop",
  crop: { x: 1, y: 1, width: 2, height: 2 },
  points: [],
  color: "#fff",
  width: 2,
};
const redact = {
  tool: "redact",
  points: [
    { x: 1, y: 1 },
    { x: 3, y: 3 },
  ],
  color: "#f00",
  width: 2,
};

test("crop exports only source pixels at original resolution and undo restores dimensions", () => {
  const editor = new AnnotationDocument(image());
  editor.commit(crop);
  assert.deepEqual(JSON.parse(editor.exportPng()), {
    width: 2,
    height: 2,
    pixels: ["p5", "p6", "p9", "p10"],
  });
  editor.undo();
  assert.deepEqual(JSON.parse(editor.exportPng()), {
    width: 4,
    height: 3,
    pixels: image().pixels,
  });
});
test("redaction is fully opaque in exported pixels and survives crop replay", () => {
  const editor = new AnnotationDocument(image());
  editor.commit(redact);
  editor.commit(crop);
  assert.deepEqual(
    JSON.parse(editor.exportPng()).pixels,
    Array(4).fill("#111111"),
  );
  editor.undo();
  assert.equal(editor.canvas.width, 4);
  assert.equal(JSON.parse(editor.exportPng()).pixels[5], "#111111");
  editor.undo();
  assert.deepEqual(JSON.parse(editor.exportPng()).pixels, image().pixels);
});
test("baked operations remain visible after exhausting the bounded undo list", () => {
  const editor = new AnnotationDocument(image());
  editor.commit(redact);
  for (let index = 0; index < 256; index++)
    editor.commit({
      ...redact,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    });
  for (let index = 0; index < 256; index++) editor.undo();
  assert.equal(editor.canUndo, false);
  assert.equal(JSON.parse(editor.exportPng()).pixels[0], "p0");
  assert.equal(JSON.parse(editor.exportPng()).pixels[5], "#111111");
  editor.dispose();
  assert.equal(editor.canvas.width, 0);
});
test("oversized originals fail explicitly rather than creating unbounded canvases", () => {
  assert.throws(
    () => new AnnotationDocument({ naturalWidth: 10000, naturalHeight: 10000 }),
    /40 megapixel/,
  );
  assert.throws(
    () => new AnnotationDocument({ naturalWidth: 100, naturalHeight: 40000 }),
    /32,767 pixel/,
  );
});

test("redo restores crop exactly and a new edit clears redo", () => {
  const editor = new AnnotationDocument(image());
  editor.commit(crop); const expected = editor.exportPng();
  editor.undo(); assert.equal(editor.canRedo, true);
  editor.redo(); assert.equal(editor.exportPng(), expected);
  editor.undo(); editor.commit(redact); assert.equal(editor.canRedo, false);
});

test("quick crop export leaves the document and undo history unchanged", () => {
  const editor = new AnnotationDocument(image());
  const original = editor.exportPng();
  assert.deepEqual(JSON.parse(editor.exportPng(crop.crop)), {
    width: 2, height: 2, pixels: ["p5", "p6", "p9", "p10"],
  });
  assert.equal(editor.exportPng(), original);
  assert.equal(editor.canUndo, false);
  assert.throws(() => editor.exportPng({x: 3, y: 0, width: 2, height: 1}), /crop/i);
});
