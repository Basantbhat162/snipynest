import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {useVirtualizer} from "@tanstack/react-virtual";
import {ArrowUpRight,Check,Code2,Copy,FileImage,FileText,Link,Pin,Search,Trash2,X} from "lucide-react";
import {QuickClipboardController,type QuickKind} from "../lib/quickClipboard";
import type {Clip} from "../types/clip";
import "./QuickClipboard.css";
export type QuickSession={id:string;can_paste:boolean;message?:string};
const categories:[QuickKind,string][]=[["all","All"],["image","Images"],["text","Text"],["code","Code"],["link","Links"]];
const icons={image:FileImage,text:FileText,code:Code2,link:Link,file:FileText};
const previews=new Map<string,string|null>();
function Preview({clip}:{clip:Clip}){
  const [preview,setPreview]=useState<string|null>(previews.get(clip.id)??null);
  useEffect(()=>{
    let active=true;
    if(!previews.has(clip.id))void invoke<string|null>("get_quick_preview",{id:clip.id}).then(value=>{
      if(previews.size>=40)previews.delete(previews.keys().next().value!);
      previews.set(clip.id,value);if(active)setPreview(value);
    }).catch(()=>{});
    return()=>{active=false;};
  },[clip.id]);
  const Icon=icons[clip.clip_type];
  return preview?<img src={preview} alt="Captured image" draggable={false}/>:<Icon size={22}/>;
}
export function QuickClipboard({session,controller}:{session:QuickSession;controller:QuickClipboardController}){
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot);
  const [selected,setSelected]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState(session.message??"");
  const [error,setError]=useState("");
  const [changed,setChanged]=useState(false);
  const [batch,setBatch]=useState<{token:string;count:number}|null>(null);
  const [undo,setUndo]=useState<string|null>(null);
  const lock=useRef(false);
  const search=useRef<HTMLInputElement>(null);
  const rows=useRef<HTMLDivElement>(null);
  const virtualizer=useVirtualizer({count:state.clips.length,getScrollElement:()=>rows.current,estimateSize:()=>72,getItemKey:index=>state.clips[index]?.id??index,overscan:2});
  const opened=useRef(false);
  const keyboardMove=useRef(false);
  const selectedClip=state.clips.find(c=>c.id===selected)??state.clips[0];
  const dismiss=()=>void invoke("dismiss_quick_clipboard",{id:session.id}).catch(e=>setError(String(e)));
  useEffect(()=>{
    controller.open();search.current?.focus();
    const sub=listen("new-clip",()=>setChanged(true));
    return()=>{controller.close();void sub.then(fn=>fn());};
  },[controller]);
  useEffect(()=>{
    if(!opened.current){
      opened.current=true;
      void invoke("show_quick_clipboard",{id:session.id}).then(()=>search.current?.focus()).catch(e=>setError(String(e)));
      return()=>{opened.current=false;};
    }
  },[session.id]);
  useEffect(()=>{
    const index=state.clips.findIndex(clip=>clip.id===selected);
    if(index>=0)virtualizer.scrollToIndex(index,{align:"auto"});
    if(keyboardMove.current){
      keyboardMove.current=false;
      const frame=requestAnimationFrame(()=>rows.current?.querySelector<HTMLButtonElement>('[data-active="true"] .quick-paste')?.focus({preventScroll:true}));
      return()=>cancelAnimationFrame(frame);
    }
  },[selected]);
  const run=async(action:()=>Promise<void>)=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError("");
    try{await action();}catch(e){setError(String(e));}finally{lock.current=false;setBusy(false);}
  };
  const choose=(clip:Clip|undefined,copyOnly=false)=>{
    const live=controller.getSnapshot();
    if(!clip||live.loading||!live.clips.some(c=>c.id===clip.id)||batch)return;
    void run(async()=>{
      const result=await invoke<{pasted:boolean;message?:string}>("paste_quick_clip",{id:session.id,clipId:clip.id,copyOnly:copyOnly||!session.can_paste});
      if(result.message)setMessage(result.message);
    });
  };
  const update=(next:Partial<typeof state.query>)=>{setSelected(null);setChanged(false);controller.load({...state.query,...next,offset:0});};
  return <section className="quick-clipboard" aria-label="Quick Clipboard" onKeyDown={event=>{
    if(event.nativeEvent.isComposing)return;
    if(event.ctrlKey&&event.key.toLowerCase()==="k"){event.preventDefault();search.current?.focus();return;}
    if(event.repeat&&event.key==="Enter"){event.preventDefault();return;}
    if(event.key==="Escape"){event.preventDefault();if(batch)setBatch(null);else dismiss();return;}
    if(batch||busy)return;
    const editing=event.target instanceof HTMLInputElement;
    if(event.key==="ArrowDown"||event.key==="ArrowUp"){
      event.preventDefault();
      const index=state.clips.findIndex(c=>c.id===selectedClip?.id);
      const next=Math.max(0,Math.min(state.clips.length-1,index+(event.key==="ArrowDown"?1:-1)));
      keyboardMove.current=true;
      setSelected(state.clips[next]?.id??null);
      rows.current?.focus();
    }else if(event.key==="Enter"&&(editing||event.target===rows.current)){
      event.preventDefault();choose(selectedClip);
    }else if(!editing&&event.ctrlKey&&event.key.toLowerCase()==="c"){
      event.preventDefault();choose(selectedClip,true);
    }
  }}>
    <header><strong>Clipboard</strong><div>
      <button title="Clear unpinned clips" aria-label="Clear unpinned clips" disabled={busy} onClick={()=>void run(async()=>{
        const prepared=await invoke<{token:string;count:number}>("prepare_clip_batch",{filter:{trash_only:false},ids:[],includePinned:false});
        setBatch(prepared);
      })}><Trash2 size={16}/></button>
      <button title="Open full workspace" aria-label="Open full workspace" disabled={busy} onClick={()=>void invoke("open_quick_workspace",{id:session.id,clipId:selectedClip?.id??null}).catch(e=>setError(String(e)))}><ArrowUpRight size={18}/></button>
      <button title="Close" aria-label="Close Quick Clipboard" onClick={dismiss}><X size={17}/></button>
    </div></header>
    <label className="quick-search"><Search size={16}/><input ref={search} type="search" aria-label="Search clips" placeholder="Search clips…" value={state.query.search} maxLength={4096} onChange={e=>update({search:e.target.value})}/></label>
    <nav aria-label="Clip categories">{categories.map(([kind,label])=><button key={kind} aria-pressed={state.query.kind===kind} onClick={()=>update({kind})}>{label}</button>)}<button className="quick-pinned" aria-label="Pinned clips only" title="Pinned clips only" aria-pressed={state.query.pinned} onClick={()=>update({pinned:!state.query.pinned})}><Pin size={15}/></button></nav>
    {changed&&<button className="quick-new" onClick={()=>{controller.load({...state.query,offset:0});setChanged(false);}}>New clips available · Refresh</button>}
    {batch?<div className="quick-clear" role="alertdialog" aria-label="Clear unpinned clips">
      <strong>Clear {batch.count.toLocaleString()} unpinned clips?</strong><p>Moves them to SnipyNest Trash. Pins and Windows Clipboard stay unchanged.</p>
      <button autoFocus disabled={busy} onClick={()=>setBatch(null)}>Cancel</button>
      <button disabled={busy||!batch.count} onClick={()=>void run(async()=>{
        const count=await invoke<number>("trash_clip_batch",{token:batch.token});setUndo(batch.token);setBatch(null);controller.load({...state.query,offset:0});setMessage(`Moved ${count} clips to Trash.`);
      })}>Move to Trash</button>
    </div>:<div ref={rows} className="quick-rows" role="list" aria-label="Clips" tabIndex={0} aria-busy={state.loading}>
      {state.loading&&!state.clips.length?<p className="quick-empty" role="status">Finding clips…</p>:!state.clips.length?<p className="quick-empty">{state.error?"Could not load clips.":"No clips here yet."}</p>:<div role="presentation" style={{height:virtualizer.getTotalSize(),position:"relative"}}>{virtualizer.getVirtualItems().map(item=>{const clip=state.clips[item.index];return <div key={clip.id} className="quick-row" style={{position:"absolute",top:0,left:0,width:"100%",height:item.size,transform:`translateY(${item.start}px)`}} data-active={clip.id===selectedClip?.id} role="listitem" id={"quick-"+clip.id} onPointerEnter={()=>setSelected(clip.id)}>
        <button className="quick-paste" aria-current={clip.id===selectedClip?.id?"true":undefined} disabled={busy||state.loading} onClick={()=>choose(clip)} aria-label={(session.can_paste?"Paste ":"Copy ")+(clip.text_content?.slice(0,80)||clip.clip_type)}>
          {(clip.clip_type==="image"||clip.clip_type==="file")&&<span className="quick-thumbnail"><Preview clip={clip}/></span>}
          <span className="quick-content"><span className={clip.clip_type==="code"?"quick-text quick-code":"quick-text"}>{clip.text_content||(clip.clip_type==="file"?"PDF document":"Screenshot")}</span>
          <small>{clip.source_app?.replace(/\.exe$/i,"")||"Clip"} · {new Date(clip.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}{clip.dimensions?" · "+clip.dimensions:""}</small></span>
        </button>
        <div className="quick-row-actions"><button aria-label={clip.is_pinned?"Unpin clip":"Pin clip"} title={clip.is_pinned?"Unpin":"Pin"} aria-pressed={clip.is_pinned} disabled={busy} onClick={()=>void run(async()=>{const pinned=await invoke<boolean>("toggle_clip_pin",{id:clip.id});controller.updatePin(clip.id,pinned);})}><Pin size={14}/></button><button aria-label="Copy clip" title="Copy only" disabled={busy||state.loading} onClick={()=>choose(clip,true)}><Copy size={14}/></button></div>
      </div>;})}</div>}
      {state.hasMore&&<button className="quick-more" disabled={busy||state.loading} onClick={()=>controller.load({...state.query,offset:state.query.offset+40},true)}>Load more clips</button>}
    </div>}
    {(error||state.error)&&<p className="quick-feedback error" role="alert">{error||state.error}<button onClick={()=>controller.load({...state.query,offset:0})}>Retry</button></p>}
    {message&&<p className="quick-feedback" role="status"><Check size={14}/>{message}{undo&&<button disabled={busy} onClick={()=>void run(async()=>{await invoke("undo_clip_batch",{token:undo});setUndo(null);setMessage("Clips restored.");controller.load({...state.query,offset:0});})}>Undo</button>}</p>}
    <footer><span>↑↓ Select · Enter {session.can_paste?"Paste":"Copy"}</span><span>Esc Close</span></footer>
  </section>;
}
