import test from 'node:test';
import assert from 'node:assert/strict';

let listener;
let failClipboard = false;
let clipboardWrites = 0;
const drawCalls = [];
const bitmaps = [];
globalThis.chrome = { runtime: { id: 'companion', onMessage: { addListener(callback) { listener = callback; } } } };
globalThis.document = {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({ drawImage: (...args) => drawCalls.push(args.slice(1)) }),
    toBlob: callback => callback(new Blob(['PNG encoded data'], { type: 'image/png' })),
  }),
};
globalThis.fetch = async () => ({ blob: async () => new Blob(['viewport PNG']) });
globalThis.createImageBitmap = async () => {
  const bitmap = { width: 1000, height: 800, closed: false, close() { this.closed = true; } };
  bitmaps.push(bitmap);
  return bitmap;
};
globalThis.ClipboardItem = class { constructor(data) { this.data = data; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { write: async items => {
  if (failClipboard) throw new Error('Clipboard permission denied');
  assert.equal(items[0].data['image/png'].type, 'image/png');
  clipboardWrites += 1;
} } }, configurable: true });
await import('../offscreen.js');
function request(action, data) { return new Promise(resolve => listener({ target: 'offscreen', action, data }, { id: 'companion' }, resolve)); }
const metrics = { viewportWidth: 1000, viewportHeight: 800, totalHeight: 1900, devicePixelRatio: 1 };

test('offscreen adapter stitches only new pixels, releases decoded images, and writes a PNG clipboard item', async () => {
  await request('start', metrics);
  for (const y of [0, 800, 1100]) assert.equal((await request('append', { y, dataUrl: 'data:image/png;base64,AA==' })).success, true);
  assert.deepEqual(drawCalls[2], [0, 500, 1000, 300, 0, 1600, 1000, 300]);
  assert.ok(bitmaps.every(bitmap => bitmap.closed));
  const result = await request('finish');
  assert.equal(result.success, true);
  assert.equal(result.width, 1000);
  assert.equal(result.height, 1900);
  assert.equal(clipboardWrites, 1);
});

test('offscreen adapter refuses partial images without overwriting the clipboard', async () => {
  await request('start', metrics);
  await request('append', { y: 0, dataUrl: 'data:image/png;base64,AA==' });
  assert.match((await request('finish')).error, /incomplete/);
  assert.equal(clipboardWrites, 1);
});

test('offscreen clipboard permission failure reaches the capture caller', async () => {
  await request('start', { ...metrics, totalHeight: 800 });
  await request('append', { y: 0, dataUrl: 'data:image/png;base64,AA==' });
  failClipboard = true;
  const result = await request('finish');
  assert.equal(result.success, true);
  assert.equal(result.copied, false);
  assert.equal(result.resultAvailable, true);
  assert.match(result.warning, /clipboard access failed/);
  assert.equal((await request('result-preview')).success, true);
});

test('a failed new attempt preserves the previous completed PNG',async()=>{
  const previous=await request('result-preview');
  await request('start',metrics);
  await request('append',{y:0,dataUrl:'data:image/png;base64,AA=='});
  assert.equal((await request('finish')).success,false);
  const retained=await request('result-preview');
  assert.equal(retained.success,true);
  assert.equal(retained.resultId,previous.resultId);
});

test('explicit partial finish crops output to covered rows without automatic copy',async()=>{
  await request('start',metrics);
  await request('append',{y:0,dataUrl:'data:image/png;base64,AA=='});
  const writes=clipboardWrites;
  const result=await request('finish',{partial:true});
  assert.equal(result.success,true);
  assert.equal(result.height,800);
  assert.equal(result.partial,true);
  assert.equal(result.copied,false);
  assert.equal(clipboardWrites,writes);
});
