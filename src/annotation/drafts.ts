import type { AnnotationDocument } from "./document";
import type { Clip } from "../types/clip";
import type { Rectangle } from "./geometry";
export interface Draft { clip: Clip; savedAt: number; document: ReturnType<AnnotationDocument["snapshot"]>; crop: Rectangle | null; tool: string; color: string; width: number; text: string; }
// One recoverable session, capped at 64 MB of serialized data and seven days.
function database(): Promise<IDBDatabase> { return new Promise((resolve,reject) => { const r=indexedDB.open("omnicopy-editor",1); r.onupgradeneeded=()=>r.result.createObjectStore("drafts"); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); }
async function transaction<T>(write: boolean, operation: (store: IDBObjectStore)=>IDBRequest<T>): Promise<T> { const db=await database(); try { return await new Promise<T>((resolve,reject)=>{ const tx=db.transaction("drafts",write?"readwrite":"readonly"); const req=operation(tx.objectStore("drafts")); tx.oncomplete=()=>resolve(req.result); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error || new Error("Draft transaction was interrupted")); }); } finally { db.close(); } }
export async function readDraft(): Promise<Draft | undefined> { const draft=await transaction<Draft|undefined>(false,s=>s.get("current")); if(draft && Date.now()-draft.savedAt>7*86400000){ await discardDraft(); return undefined; } return draft; }
// Serialize writes so a slow autosave cannot resurrect a discarded draft.
let writes: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = writes.then(operation, operation);
  writes = result.catch(() => {});
  return result;
}
export function saveDraft(draft: Draft) {
  const serialized = JSON.stringify(draft);
  if(serialized.length*2>64*1024*1024) return Promise.reject(new Error("Draft exceeds 64 MB. Save the image to history before closing."));
  const snapshot: Draft = JSON.parse(serialized);
  return enqueue(async () => {
    const previous = await transaction<Draft | undefined>(false,s=>s.get("current"));
    if (previous && previous.clip.id !== snapshot.clip.id) throw new Error("Another image has an unfinished draft. Resume and save or discard it first.");
    await transaction(true,s=>s.put(snapshot,"current"));
  });
}
export function discardDraft(clipId?: string) { return enqueue(async()=>{
  const previous = await transaction<Draft | undefined>(false,s=>s.get("current"));
  if (!clipId || previous?.clip.id === clipId) await transaction(true,s=>s.delete("current"));
}); }
