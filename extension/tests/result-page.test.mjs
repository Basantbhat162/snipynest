import test from 'node:test';
import assert from 'node:assert/strict';

test('result page retains its own PNG and supports retry after clipboard denial', async () => {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id,{hidden:true,dataset:{},addEventListener(type,fn){this[type]=fn;}});
    return nodes.get(id);
  };
  globalThis.document={getElementById:node,hasFocus:()=>true};
  const events = {};
  globalThis.window={addEventListener(type, callback){events[type]=callback;}};
  globalThis.chrome={runtime:{sendMessage:async()=>({success:true,url:'blob:offscreen/result'})}};
  globalThis.fetch=async()=>({ok:true,blob:async()=>new Blob(['PNG'],{type:'image/png'})});
  globalThis.ClipboardItem=class {constructor(data){this.data=data;}};
  let fail=true, writes=0, attempts=0;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{write:async items=>{
    attempts++;
    if(fail)throw new Error('Document is not focused');
    assert.equal(items[0].data['image/png'].type,'image/png');writes++;
  }}}});
  await import('../result.js');
  assert.equal(node('save').hidden,false);
  assert.match(node('save').href,/^blob:/);
  assert.notEqual(node('save').href,'blob:offscreen/result');
  assert.equal(node('copy').disabled,false);
  assert.equal(attempts,0, "Opening a retained result must not overwrite later clipboard content");
  events.focus?.();
  assert.equal(attempts,0);
  await node("copy").click();
  assert.equal(attempts,1);
  fail=false;
  await node('copy').click();
  assert.equal(writes,1);
  assert.equal(node('status').textContent,'Copied to clipboard.');
});
