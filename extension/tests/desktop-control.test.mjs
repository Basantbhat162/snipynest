import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopControl} from '../desktop-control.mjs';

function fixture() {
  const calls=[], messages=[], timers=[]; let allowed=true,focused=true,tabId=7,busy=false,removed;
  const port={onMessage:{addListener(fn){this.listener=fn;}},onDisconnect:{addListener(fn){this.listener=fn;}},postMessage(value){messages.push(value);},disconnect(){this.onDisconnect.listener?.();}};
  const api={runtime:{connectNative(name){assert.equal(name,'com.snipynest.companion');return port;}},storage:{local:{get:async()=>({}),set:async()=>{}}},permissions:{contains:async()=>allowed,onRemoved:{addListener(fn){removed=fn;}}},windows:{getLastFocused:async()=>({id:1,focused})},tabs:{query:async()=>[{id:tabId,url:'https://example.test/'}]}};
  const control=createDesktopControl(api,async(...args)=>calls.push(args),()=>busy,{setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){}});
  return {control,port,calls,messages,timers,set(values){if('allowed'in values)allowed=values.allowed;if('focused'in values)focused=values.focused;if('tabId'in values)tabId=values.tabId;if('busy'in values)busy=values.busy;},remove:()=>removed()};
}
test('desktop controls are opt-in and permission-gated',async()=>{
  const f=fixture();await f.control.restore();assert.equal(f.messages.length,0);
  f.set({allowed:false});await f.control.setEnabled(true);assert.equal(f.messages.length,0);assert.equal(f.control.status().connected,false);
});
test('desktop PDF command uses the focused tab and fixed full-page PDF output',async()=>{
  const f=fixture();await f.control.setEnabled(true);assert.deepEqual(f.messages[0],{action:'poll',focused:true,ready:true,tabId:7});
  await f.port.onMessage.listener({connected:true,capture:'pdf',tabId:7});assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].slice(1),['full',false,'pdf',false]);
  await f.control.setEnabled(false);assert.equal(f.control.status().enabled,false);assert.equal(f.control.status().connected,false);
});
test('focus loss, tab changes and a busy capture reject native capture commands',async()=>{
  const f=fixture();await f.control.setEnabled(true);
  for(const values of [{focused:false},{focused:true,tabId:8},{tabId:7,busy:true},{busy:false,allowed:false}]){
    f.set(values);await f.port.onMessage.listener({connected:true,capture:'visible',tabId:7});
  }
  assert.equal(f.calls.length,0);
  f.remove();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.control.status().enabled,false);
});
