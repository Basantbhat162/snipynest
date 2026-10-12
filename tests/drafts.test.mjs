import test from 'node:test';
import assert from 'node:assert/strict';
import {saveDraft,readDraft,discardDraft} from '../src/annotation/drafts.ts';

// Asynchronous transactional adapter: exercises ordering rather than browser storage internals.
let current;
globalThis.indexedDB={open(){
  const request={};
  queueMicrotask(()=>{request.result={close(){},transaction(){
    const tx={objectStore(){return {
      get(){return perform(()=>structuredClone(current));},
      put(value){return perform(()=>{current=structuredClone(value);});},
      delete(){return perform(()=>{current=undefined;});},
    };}};
    function perform(action){const req={};setTimeout(()=>{req.result=action();tx.oncomplete();},2);return req;}
    return tx;
  }};request.onsuccess();});return request;
}};
const draft=id=>({clip:{id},savedAt:Date.now(),document:{actions:[]},crop:null,tool:'pen',color:'#fff',width:4,text:''});
test('discard waits for pending autosave and cannot resurrect a draft',async()=>{
  const write=saveDraft(draft('a'));
  const remove=discardDraft('a');
  await Promise.all([write,remove]);
  assert.equal(await readDraft(),undefined);
});
test('editing another clip cannot replace or discard an unfinished draft',async()=>{
  await saveDraft(draft('a'));
  await assert.rejects(saveDraft(draft('b')),/Another image/);
  await discardDraft('b');
  assert.equal((await readDraft()).clip.id,'a');
  await discardDraft('a');
});
test('autosave snapshots actions before a later edit mutates the document',async()=>{
  const input=draft('a');
  const write=saveDraft(input);
  input.document.actions.push({tool:'crop'});
  await write;
  assert.deepEqual((await readDraft()).document.actions,[]);
  await discardDraft();
});
