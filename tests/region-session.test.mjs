import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const compiled=ts.transpileModule(readFileSync(new URL("../src/components/RegionCapture.tsx",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test("old capture completion, clear and decode callbacks cannot dismiss or revoke a replacement",async()=>{
 const slots=[],events=new Map(),effects=[],revoked=[];let cursor=0,tree,nativeId="a",finishCopy,url=0;
 const hooks={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],next=>{slots[i]=typeof next==="function"?next(slots[i]):next;}];},
  useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
  useEffect(fn){const i=cursor++;if(!(i in slots)){slots[i]=true;effects.push(fn);}}
 };
 const jsx=(type,props)=>({type,props});
 const modules={
  react:hooks,"react/jsx-runtime":{jsx,jsxs:jsx},
  "@tauri-apps/api/core":{invoke:async(name,args)=>{
   if(name==="get_region_capture_snapshot")return{id:nativeId,screens:[]};
   if(name==="get_region_capture_frame")return new Uint8Array([1,2,3]).buffer;
   if(name==="copy_region_capture")return new Promise(resolve=>{finishCopy=resolve;});
  }},
  "@tauri-apps/api/event":{listen:async(name,fn)=>{events.set(name,fn);return()=>events.delete(name);}},
  "./AnnotatorModal":{AnnotatorModal:"annotator"},"../App.css":{}
 };
 const exports={};new Function("require","exports",compiled)(name=>{assert.ok(name in modules,name);return modules[name];},exports);
 const previousURL=globalThis.URL;
 globalThis.URL={createObjectURL:()=>"blob:fixture-"+(++url),revokeObjectURL:value=>revoked.push(value)};
 try{
  const render=()=>{cursor=0;tree=exports.RegionCapture();};
  render();effects.splice(0).forEach(fn=>fn());await tick();render();
  const original=tree.props;assert.equal(original.regionCapture.id,"a");
  const copy=original.onCopySelection({x:0,y:0,width:1,height:1});
  events.get("region-cleared")({payload:"a"});
  nativeId="b";events.get("region-start")({payload:"b"});await tick();render();
  const replacement=tree.props;assert.equal(replacement.regionCapture.id,"b");
  original.regionCapture.sourceDecoded();
  assert.ok(!revoked.includes(replacement.regionCapture.image),"Old decoding must not revoke the new frame");
  events.get("region-cleared")({payload:"a"});render();
  assert.equal(tree?.props.regionCapture.id,"b","A late clear belongs only to its original capture");
  finishCopy();await copy;render();
  assert.equal(tree?.props.regionCapture.id,"b","A late Copy acknowledgement must not close the next capture");
 }finally{globalThis.URL=previousURL;}
});
