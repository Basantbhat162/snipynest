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

test('automatic delivery copies both PNG and PDF once without a click, then closes',async()=>{
  const nodes=new Map(),events={};let writes=0,closed=0,claims=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,dataset:{},addEventListener(type,fn){this[type]=fn;}});return nodes.get(id);};
  globalThis.document={getElementById:node,hasFocus:()=>true};
  globalThis.window={addEventListener(type,fn){events[type]=fn;},close(){closed++;}};
  globalThis.location={search:'?deliver=current'};
  globalThis.chrome={runtime:{sendMessage:async message=>{
    if(message.action==='claim-delivery'){claims++;return {success:claims===1};}
    return {success:true,resultId:'current',url:'blob:png',pdfUrl:'blob:pdf'};
  }}};
  globalThis.fetch=async url=>({ok:true,blob:async()=>new Blob([url==='blob:pdf'?'%PDF-1.4':'PNG'],{type:url==='blob:pdf'?'application/pdf':'image/png'})});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{write:async items=>{
    assert.equal(await items[0].data['image/png'].text(),'PNG');
    assert.match(await items[0].data['web application/x-snipynest-capture-pdf'].text(),/^%PDF/);writes++;
  }}}});
  await import('../result.js?automatic');
  assert.equal(writes,1);assert.equal(node('savePdf').hidden,false);
  events.focus();events.focus();assert.equal(writes,1);
  await new Promise(resolve=>setTimeout(resolve,400));assert.equal(closed,1);
  delete globalThis.location;
});

test('an expired delivery lease never automatically overwrites the clipboard',async()=>{
  const nodes=new Map();let writes=0;
  globalThis.document={hasFocus:()=>true,getElementById:id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},addEventListener(){}});return nodes.get(id);}};
  globalThis.window={addEventListener(){}};globalThis.location={search:'?deliver=expired'};
  globalThis.chrome={runtime:{sendMessage:async message=>message.action==='claim-delivery'?{success:false}:{success:true,resultId:'expired',url:'blob:png'}}};
  globalThis.fetch=async()=>({ok:true,blob:async()=>new Blob(['PNG'],{type:'image/png'})});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{write:async()=>{writes++;}}}});
  await import('../result.js?expired');assert.equal(writes,0);delete globalThis.location;
});
