import {useEffect,useRef,useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import App from "../App";
import {QuickClipboard,type QuickSession} from "./QuickClipboard";
import {QuickClipboardController} from "../lib/quickClipboard";
import type {Clip} from "../types/clip";
export function MainWorkspace(){
  const [session,setSession]=useState<QuickSession|null>(null);
  const changed=useRef(0);
  const [controller]=useState(()=>new QuickClipboardController(q=>invoke<Clip[]>("get_quick_clips",{...q,kind:q.kind==="all"?null:q.kind})));
  useEffect(()=>{
    let active=true;
    const subscription=listen<QuickSession|null>("quick-clipboard-changed",event=>{changed.current++;if(active)setSession(event.payload);});
    void subscription.then(async()=>{const revision=changed.current;const current=await invoke<QuickSession|null>("get_quick_session");if(active&&revision===changed.current)setSession(current);}).catch(()=>{});
    return()=>{active=false;void subscription.then(fn=>fn());};
  },[]);
  return <><div hidden={!!session} className="full-workspace"><App suspended={!!session}/></div>{session&&<QuickClipboard key={session.id} session={session} controller={controller}/>}</>;
}
