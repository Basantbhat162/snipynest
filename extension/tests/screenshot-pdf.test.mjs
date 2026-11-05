import test from 'node:test';
import assert from 'node:assert/strict';
import {assemblePdf, screenshotPdf} from '../screenshot-pdf.mjs';

test('PDF byte offsets, stream lengths and page references remain valid with binary image bytes', async () => {
  const pages = [{width:600,height:848,bytes:new Uint8Array([255,216,0,255,217])}, {width:600,height:80,bytes:new Uint8Array([255,216,255,217])}];
  const pdf = assemblePdf(pages);
  assert.equal(pdf.type,'application/pdf');
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  const text = Buffer.from(bytes).toString('latin1');
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(xref,xref+4),'xref');
  const rows = text.slice(xref).split('\n');
  assert.equal(rows[1],'0 9');
  for(let id=1;id<=8;id++) {
    const offset=Number(rows[id+2].slice(0,10));
    assert.ok(text.slice(offset).startsWith(`${id} 0 obj\n`));
  }
  assert.match(text,/\/Count 2 \/Kids \[3 0 R 6 0 R\]/);
  assert.match(text,/\/MediaBox \[0 0 595.28 841.89\]/);
  assert.ok(text.endsWith('%%EOF\n'));
  assert.throws(()=>assemblePdf([]),/between 1 and 100/);
});

test('PDF encoding uses bounded strips, preserves every row and releases its canvas', async () => {
  const previous=globalThis.document;
  const calls=[];
  const strip={width:0,height:0,getContext:()=>({fillRect(){},drawImage(...args){calls.push(args.slice(1));}}),toBlob:callback=>callback(new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'}))};
  globalThis.document={createElement:()=>strip};
  try {
    const pdf=await screenshotPdf({width:600,height:1900});
    assert.equal(calls.length,3);
    assert.deepEqual(calls.map(call=>[call[1],call[3]]),[[0,848],[848,848],[1696,204]]);
    assert.equal(strip.width,0);assert.equal(strip.height,0);
    assert.match(await pdf.text(),/\/Count 3/);
  } finally {globalThis.document=previous;}
});
