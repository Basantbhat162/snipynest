import test from 'node:test';
import assert from 'node:assert/strict';
import {copyInCapturedPage} from '../clipboard-delivery.mjs';

test('delivery refuses stale documents, lost focus and oversized transfers',async()=>{
  let writes=0;
  globalThis.window={__omnicopyCapture:{token:'current'}};
  globalThis.document={hasFocus:()=>true};
  globalThis.ClipboardItem=class {};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{write:async()=>{writes++}}}});
  assert.equal(await copyInCapturedPage('old',btoa('png')),false);
  assert.equal(await copyInCapturedPage('current','a'.repeat(24*1024*1024+1)),false);
  document.hasFocus=()=>false;
  assert.equal(await copyInCapturedPage('current',btoa('png')),false);
  assert.equal(writes,0);
  document.hasFocus=()=>true;
  navigator.clipboard.write=async()=>{throw new Error('denied')};
  assert.equal(await copyInCapturedPage('current',btoa('png')),false);
});
