import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../popup.js', import.meta.url), 'utf8');
async function popupFixture(initialStatus, options = {}) {
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,dataset:{},value:'full',checked:false,addEventListener(type,fn){this[type]=fn;},setAttribute(){}});return nodes.get(id);};
 let onStatus,writes=0;const acknowledgements=[];
 const result={success:true,url:'blob:synthetic/result',resultId:'image-1',partial:false};
 const context={Blob,URL,console,setTimeout,clearTimeout,document:{getElementById:node,hasFocus:()=>true},navigator:{clipboard:{write:async items=>{await options.beforeWrite?.();assert.equal((await items[0].data['image/png']).type,'image/png');writes++;}}},ClipboardItem:class{constructor(data){this.data=data;}},fetch:options.fetch || (async()=>({ok:true,blob:async()=>new Blob(['synthetic'],{type:'image/png'})})),chrome:{runtime:{onMessage:{addListener(fn){onStatus=fn;}},sendMessage:async request=>{if(request.action==='result-preview')return {...result};if(request.action==='capture-status')return initialStatus;if(request.action==='copy-complete')acknowledgements.push(request.resultId);return {success:true};}},commands:{getAll:async()=>[]},tabs:{query:async()=>[{id:7,url:'https://example.test/'}]}}};
 vm.runInNewContext(source,context);
 const flush=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};await flush();
 return {node,flush,result,get writes(){return writes;},acknowledgements,publish(status){onStatus({target:'popup',action:'capture-status',status});}};
}
test('opening the popup never copies an older pending result over newer clipboard content',async()=>{const popup=await popupFixture({phase:'complete',resultAvailable:true,copied:false,tabId:7,sourceUrl:'https://example.test/'});assert.equal(popup.writes,0);assert.equal(popup.node('result').hidden,false);await popup.node('copyResult').click();assert.equal(popup.writes,1);assert.deepEqual(popup.acknowledgements,['image-1']);});
test('a new popup-initiated capture still copies automatically when focused',async()=>{const popup=await popupFixture({phase:'idle'});await popup.node('captureBtn').click();popup.publish({phase:'complete',resultAvailable:true,copied:false,tabId:7,sourceUrl:'https://example.test/'});await popup.flush();assert.equal(popup.writes,1);popup.publish({phase:'complete',resultAvailable:true,copied:false,tabId:7,sourceUrl:'https://example.test/'});await popup.flush();assert.equal(popup.writes,1);});

test('a delayed startup status cannot copy an old result after a new Capture click',async()=>{
 let resolveStatus;const status=new Promise(resolve=>{resolveStatus=resolve;});const popup=await popupFixture(status);
 await popup.node('captureBtn').click();resolveStatus({phase:'complete',resultAvailable:true,copied:false,tabId:7,sourceUrl:'https://example.test/'});
 await popup.flush();assert.equal(popup.writes,0);
 popup.publish({phase:'complete',resultAvailable:true,copied:false,tabId:7,sourceUrl:'https://example.test/'});await popup.flush();assert.equal(popup.writes,1);
});

test('a slow explicit Copy acknowledges its own image, not a replacement preview',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});const popup=await popupFixture({phase:'idle'},{beforeWrite:()=>gate});
 const copying=popup.node('copyResult').click();await popup.flush();popup.result.resultId='image-2';popup.result.url='blob:synthetic/replacement';popup.publish({phase:'complete',resultAvailable:true,copied:true});await popup.flush();release();await copying;assert.deepEqual(popup.acknowledgements,['image-1']);
});
test('a slow previous preview cannot replace a newer result or mismatch its copy identity',async()=>{
 let release;const slow=new Promise(resolve=>{release=resolve;});const response=()=>({ok:true,blob:async()=>new Blob(['synthetic'],{type:'image/png'})});
 const popup=await popupFixture({phase:'idle'},{fetch:url=>url==='blob:synthetic/slow'?slow:Promise.resolve(response())});
 popup.result.resultId='image-2';popup.result.url='blob:synthetic/slow';popup.publish({phase:'complete',resultAvailable:true,copied:true});await popup.flush();
 popup.result.resultId='image-3';popup.result.url='blob:synthetic/newest';popup.publish({phase:'complete',resultAvailable:true,copied:true});await popup.flush();
 release(response());await popup.flush();assert.equal(popup.node('preview').src,'blob:synthetic/newest');await popup.node('copyResult').click();assert.deepEqual(popup.acknowledgements,['image-3']);
});
