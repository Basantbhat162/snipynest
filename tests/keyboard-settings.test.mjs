import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync(new URL('../src/components/KeyboardSettings.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
  let draft={capturePaused:false,startAtLogin:false,trashRetentionDays:30,singleKeyEnabled:true,singleKeyBindings:[{key:'PageUp',action:'snip'}]},cursor=0,tree,keydown;
  const slots=[],effects=[],cleanups=[],calls=[];let busy;
  const hooks={useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useEffect(fn,deps){const i=cursor++;if(!deps||!slots[i]||deps.some((v,j)=>v!==slots[i][j]))effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});slots[i]=deps;}};
  const jsx=(type,props)=>({type,props}),exports={};
  const modules={react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'@tauri-apps/api/core':{invoke:async name=>{calls.push(name);return name==='begin_key_recording'?'recording-token':name==='install_browser_control'?'Helper registered':{connected:false,ready:false,active:false};}}};
  const win={addEventListener(type,fn){if(type==='keydown')keydown=fn;},removeEventListener(type,fn){if(type==='keydown'&&keydown===fn)keydown=undefined;}};
  new Function('require','exports','window','setInterval','clearInterval',compiled)(name=>modules[name],exports,win,()=>0,()=>{});
  const onBusyChange=value=>busy=value;
  const render=()=>{cursor=0;tree=exports.KeyboardSettings({draft,onChange:value=>draft=value,busy:false,onBusyChange});effects.splice(0).forEach(fn=>fn());};
  const nodes=()=>{const found=[];const walk=node=>{if(Array.isArray(node))return node.forEach(walk);if(node&&typeof node==='object'){found.push(node);walk(node.props?.children);}};walk(tree);return found;};
  const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));render();};render();
  return{calls,nodes,render,flush,unmount(){cleanups.forEach(cleanup=>cleanup?.());},get draft(){return draft;},get busy(){return busy;},press(code,extras={}){keydown({code,key:code,preventDefault(){},stopImmediatePropagation(){},...extras});}};
}
test('recording preserves an enabled configuration so Save keeps the chosen keys active',async()=>{
  const f=fixture();await f.nodes().find(n=>n.props?.['aria-label']==='Record key for Quick snapshot').props.onClick();await f.flush();
  assert.ok(f.calls.includes('begin_key_recording'));assert.ok(!f.calls.includes('disarm'));assert.equal(f.busy,true);
  f.press('PageDown');await f.flush();assert.equal(f.busy,false);assert.deepEqual(f.draft.singleKeyBindings,[{key:'PageUp',action:'snip'},{key:'PageDown',action:'snapshot'}]);
  assert.ok(f.calls.includes('finish_key_recording'));
  assert.equal(f.draft.singleKeyEnabled,true,'Recording must not silently turn off the enabled setting that Save persists');
});
test('duplicate mappings are rejected and Escape ends recording without assigning a key',async()=>{
  const f=fixture();f.nodes().find(n=>n.props?.id==='key-snapshot').props.onChange({target:{value:'PageUp'}});f.render();
  assert.equal(f.draft.singleKeyBindings.length,1);assert.ok(f.nodes().some(n=>n.props?.role==='alert'));
  await f.nodes().find(n=>n.props?.['aria-label']==='Record key for Quick snapshot').props.onClick();await f.flush();
  f.press('F12');f.render();assert.equal(f.busy,true);f.press('Escape');await f.flush();assert.equal(f.busy,false);assert.equal(f.draft.singleKeyBindings.length,1);assert.equal(f.draft.singleKeyEnabled,true);
});
test('browser setup reports completion beside its own control',async()=>{
  const f=fixture();f.nodes().find(n=>n.type==='button'&&n.props.children==='Set up browser connection').props.onClick();await f.flush();
  assert.ok(f.calls.includes('install_browser_control'));
  const browserGroup=f.nodes().find(n=>n.type==='fieldset'&&n.props.children[0].props.children==='Browser keys');
  assert.ok(browserGroup.props.children.some(n=>n?.props?.role==='status'&&n.props.children==='Helper registered'));
});
test('closing Settings during recording restores the previous registrations',async()=>{
  const f=fixture();await f.nodes().find(n=>n.props?.['aria-label']==='Record key for Screen snip').props.onClick();await f.flush();
  f.unmount();await new Promise(resolve=>setImmediate(resolve));
  assert.ok(f.calls.includes('finish_key_recording'));assert.equal(f.draft.singleKeyEnabled,true);
});
test('Settings distinguishes an enabled draft from inactive Windows registrations',async()=>{
  const f=fixture();await f.flush();
  assert.equal(f.draft.singleKeyEnabled,true);
  assert.ok(f.nodes().some(n=>n.props?.role==='status'&&typeof n.props.children==='string'&&n.props.children.includes('off in Windows')));
});
