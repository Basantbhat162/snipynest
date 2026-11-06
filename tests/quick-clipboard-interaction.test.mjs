import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {QuickClipboardController} from "../src/lib/quickClipboard.ts";
const source=ts.transpileModule(readFileSync(new URL("../src/components/QuickClipboard.tsx",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function harness(native=async()=>({pasted:true})){
  const slots=[],calls=[];let cursor=0,tree;
  const hooks={
    useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return[slots[i],next=>{slots[i]=typeof next==="function"?next(slots[i]):next;}];},
    useRef(value){const i=cursor++;return slots[i]??(slots[i]={current:value});},
    useEffect(){},useSyncExternalStore(_subscribe,get){return get();}
  };
  const jsx=(type,props)=>({type,props});
  const modules={
    react:hooks,"react/jsx-runtime":{jsx,jsxs:jsx},
    "@tauri-apps/api/core":{invoke:async(name,args)=>{calls.push({name,args});return native(name,args);}},
    "@tauri-apps/api/event":{listen:async()=>()=>{}},
    "@tanstack/react-virtual":{useVirtualizer:options=>({getTotalSize:()=>options.count*72,getVirtualItems:()=>Array.from({length:options.count},(_,index)=>({index,size:72,start:index*72})),scrollToIndex(){}})},
    "lucide-react":new Proxy({},{get:(_target,name)=>name}),"../lib/quickClipboard":{QuickClipboardController},"./QuickClipboard.css":{}
  };
  const exports={};new Function("require","exports",source)(name=>{assert.ok(name in modules,name);return modules[name];},exports);
  const controller=new QuickClipboardController(async()=>[{id:"fixture",clip_type:"text",text_content:"Synthetic clip",source_app:"Fixture",created_at:"2026-11-06T00:00:00Z",is_pinned:false}]);
  controller.open();await tick();
  const render=()=>{cursor=0;tree=exports.QuickClipboard({session:{id:"session",can_paste:true},controller});};
  const nodes=()=>{const result=[];const walk=node=>{if(Array.isArray(node))node.forEach(walk);else if(node&&typeof node==="object"){result.push(node);walk(node.props?.children);}};walk(tree);return result;};
  render();return{render,nodes,controller,calls,button:label=>nodes().find(n=>n.type==="button"&&n.props["aria-label"]===label),key(event){tree.props.onKeyDown(event);}};
}
test("double click dispatches one paste and pin/copy actions are separate",async()=>{
  let finish;
  const ui=await harness(name=>name==="paste_quick_clip"?new Promise(resolve=>{finish=resolve;}):true);
  const paste=ui.button("Paste Synthetic clip");
  paste.props.onClick();paste.props.onClick();
  assert.equal(ui.calls.filter(call=>call.name==="paste_quick_clip").length,1);
  finish({pasted:true});await tick();ui.render();
  ui.button("Pin clip").props.onClick();await tick();
  assert.equal(ui.calls.filter(call=>call.name==="paste_quick_clip").length,1);
  assert.ok(ui.calls.some(call=>call.name==="toggle_clip_pin"));
});
test("a new search disables old-result paste immediately, before the next render",async()=>{
  const ui=await harness();
  const old=ui.button("Paste Synthetic clip");
  ui.nodes().find(n=>n.type==="input").props.onChange({target:{value:"new query"}});
  old.props.onClick();
  assert.equal(ui.calls.length,0);
});
test("IME Enter, repeated Enter and copying search text do not paste a clip",async()=>{
  const ui=await harness();const previous=globalThis.HTMLInputElement;
  class Input{}globalThis.HTMLInputElement=Input;
  try{
    for(const event of [{key:"Enter",nativeEvent:{isComposing:true}},{key:"Enter",repeat:true,nativeEvent:{}},{key:"c",ctrlKey:true,nativeEvent:{}}]){
      ui.key({...event,target:new Input(),preventDefault(){}});
    }
    assert.equal(ui.calls.length,0);
    ui.key({key:"Enter",nativeEvent:{},target:new Input(),preventDefault(){}});
    await tick();assert.equal(ui.calls.filter(c=>c.name==="paste_quick_clip").length,1);
  }finally{globalThis.HTMLInputElement=previous;}
});
test("Clear snapshots every unpinned clip, independent of the current search",async()=>{
  const ui=await harness(async name=>name==="prepare_clip_batch"?{token:"batch",count:12}:undefined);
  ui.button("Clear unpinned clips").props.onClick();await tick();ui.render();
  const request=ui.calls.find(c=>c.name==="prepare_clip_batch");
  assert.deepEqual(request.args,{filter:{trash_only:false},ids:[],includePinned:false});
  assert.ok(ui.nodes().some(n=>n.props?.role==="alertdialog"));
  assert.equal(ui.calls.filter(c=>c.name==="trash_clip_batch").length,0);
});
