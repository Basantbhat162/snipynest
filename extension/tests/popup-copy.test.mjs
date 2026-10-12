import test from 'node:test';
import assert from 'node:assert/strict';

test('retry Copy writes PNG from the focused popup, not the offscreen document', async () => {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden:true, dataset:{}, value:'full', addEventListener(type, fn) { this[type] = fn; }, setAttribute() {} });
    return nodes.get(id);
  };
  globalThis.document = { getElementById:node, hasFocus:()=>true };
  let writes = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable:true, value:{clipboard:{write:async items => {
    assert.equal((await items[0].data['image/png']).type, 'image/png'); writes++;
  }}}});
  globalThis.ClipboardItem = class { constructor(data) { this.data = data; } };
  globalThis.fetch = async () => ({ok:true, blob:async()=>new Blob(['png'],{type:'image/png'})});
  globalThis.chrome = {runtime:{onMessage:{addListener(){}},sendMessage:async ({action}) => {
    if(action === 'retry-copy') return {success:false,error:'Document is not focused'};
    if(action === 'result-preview') return {success:true,url:'blob:extension/result'};
    return {phase:'idle'};
  }}, commands:{getAll:async()=>[]}};
  await import('../popup.js');
  await node('copyResult').click();
  assert.equal(writes,1);
  assert.equal(node('status').textContent,'Copied to clipboard.');
});
