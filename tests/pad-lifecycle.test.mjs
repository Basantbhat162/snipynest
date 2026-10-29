import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const compiled=ts.transpileModule(readFileSync(new URL("../src/components/CapturePad.tsx",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
async function fixture() {
 const slots=[],effects=[],subscriptions=[],listeners=new Map(),reads=[],calls=[];
 let cursor=0,tree;
 const hooks={useState(initial){const n=cursor++;if(!(n in slots))slots[n]=initial;return [slots[n],v=>{slots[n]=typeof v==='function'?v(slots[n]):v;}];},useRef(initial){const n=cursor++;return slots[n]??(slots[n]={current:initial});},useEffect(fn,deps){const n=cursor++;if(!slots[n]||deps.some((v,i)=>v!==slots[n][i]))effects.push(fn);slots[n]=deps;}};
 const jsx=(type,props)=>({type,props});
 const modules={react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'@tauri-apps/api/core':{invoke:async(name,args)=>{calls.push({name,args});if(name==='get_clips')return new Promise(resolve=>reads.push(resolve));if(name==='get_pad_unread')return 2;if(name==='get_preferences')return {padPrivacy:false};}},'@tauri-apps/api/event':{listen:(name,handler)=>new Promise(resolve=>{listeners.set(name,handler);subscriptions.push(()=>resolve(()=>listeners.delete(name)));})},'../lib/useNativeDrag':{useNativeDrag:start=>({onPointerMove:start})},'../lib/useClipPreview':{useClipPreview:clip=>clip?.id},'lucide-react':{Clipboard:'icon',GripHorizontal:'icon',X:'icon',History:'icon'},'../App.css':{},'./CapturePad.css':{}};
 const exports={};new Function('require','exports',compiled)(name=>{assert.ok(name in modules,name);return modules[name];},exports);
 const render=()=>{cursor=0;tree=exports.CapturePad();return tree;};
 const previous=globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){}};
 render();const cleanups=effects.splice(0).map(fn=>fn());
 const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));render();};
 const nodes=()=>{const found=[];const walk=n=>{if(Array.isArray(n))return n.forEach(walk);if(n&&typeof n==='object'){found.push(n);walk(n.props?.children);}};walk(tree);return found;};
 return {calls,reads,subscriptions,flush,render,nodes,publish:()=>listeners.get('pad-updated')(),cleanup(){cleanups.forEach(fn=>fn?.());globalThis.window=previous;}};
}
test('Pad attaches arrival listeners before reading and ignores an older image response',async()=>{
 const pad=await fixture();try{
 assert.equal(pad.reads.length,0);pad.subscriptions.forEach(done=>done());await pad.flush();assert.equal(pad.reads.length,1);
 pad.publish();await pad.flush();assert.equal(pad.reads.length,2);
 pad.reads[1]([{id:'latest'}]);await pad.flush();pad.reads[0]([{id:'older'}]);await pad.flush();
 assert.equal(pad.nodes().find(n=>n.type==='img').props.src,'latest');
 }finally{pad.cleanup();}
});
test('Pad starts one native share per gesture and exposes one working close control',async()=>{
 const pad=await fixture();try{
 pad.subscriptions.forEach(done=>done());await pad.flush();pad.reads[0]([{id:'latest'}]);await pad.flush();
 const share=pad.nodes().find(n=>n.props?.className==='pad-image');share.props.onPointerMove();share.props.onPointerMove();
 assert.equal(pad.calls.filter(c=>c.name==='start_native_drag').length,1);
 const close=pad.nodes().filter(n=>n.props?.['aria-label']==='Dismiss Capture Pad');assert.equal(close.length,1);close[0].props.onClick();assert.equal(pad.calls.filter(c=>c.name==='dismiss_capture_pad').length,1);
 await pad.flush();
 }finally{pad.cleanup();}
});

test('Pad history control opens history and refuses a second window action during sharing',async()=>{
 const pad=await fixture();try{
 pad.subscriptions.forEach(done=>done());await pad.flush();pad.reads[0]([{id:'latest'}]);await pad.flush();
 const history=pad.nodes().find(n=>n.props?.className==='pad-history');history.props.onClick();
 assert.equal(pad.calls.filter(c=>c.name==='open_from_pad').length,1);
 const share=pad.nodes().find(n=>n.props?.className==='pad-image');share.props.onPointerMove();
 history.props.onClick();pad.render();
 assert.equal(pad.calls.filter(c=>c.name==='open_from_pad').length,1);
 assert.equal(pad.nodes().find(n=>n.props?.className==='pad-history').props.disabled,true);
 await pad.flush();
 }finally{pad.cleanup();}
});

test('Pad quick crop targets its displayed image and is disabled for PDFs',async()=>{
 const pad=await fixture();try{
 pad.subscriptions.forEach(done=>done());await pad.flush();pad.reads[0]([{id:'image',clip_type:'image'}]);await pad.flush();
 const crop=()=>pad.nodes().find(n=>n.props?.className==='pad-crop');
 assert.equal(crop().props.disabled,false);crop().props.onClick();
 assert.deepEqual(pad.calls.at(-1),{name:'open_from_pad',args:{quickCropId:'image'}});
 pad.publish();await pad.flush();pad.reads[1]([{id:'pdf',clip_type:'file'}]);await pad.flush();
 assert.equal(crop().props.disabled,true);
 }finally{pad.cleanup();}
});

test('Pad thumbnail opens its displayed capture and keeps movement available without an icon',async()=>{
 const pad=await fixture();try{
 pad.subscriptions.forEach(done=>done());await pad.flush();pad.reads[0]([{id:'image',clip_type:'image'}]);await pad.flush();
 pad.nodes().find(n=>n.props?.className==='pad-image').props.onClick();
 assert.deepEqual(pad.calls.at(-1),{name:'open_from_pad',args:{quickCropId:'image'}});
 assert.equal(pad.nodes().some(n=>n.props?.className==='pad-move'),false);
 assert.ok(pad.nodes().find(n=>n.props?.className==='pad-move-edge').props.onPointerMove);
 pad.publish();await pad.flush();pad.reads[1]([{id:'pdf',clip_type:'file'}]);await pad.flush();
 pad.nodes().find(n=>n.props?.className==='pad-image').props.onClick();
 assert.deepEqual(pad.calls.at(-1),{name:'open_clip_file',args:{id:'pdf'}});
 }finally{pad.cleanup();}
});
