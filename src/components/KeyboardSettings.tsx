import {useEffect,useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import type {Preferences} from "../types/clip";
type Binding=NonNullable<Preferences["singleKeyBindings"]>[number];
const actions:[Binding["action"],string][]=[["snip","Screen snip"],["snapshot","Quick snapshot"],["history","Open history"],["browserVisible","Browser visible PNG"],["browserFull","Browser full PNG"],["browserPdf","Browser full PDF"]];
const keys=["PageUp","PageDown","Home","End","Insert","PrintScreen","Pause","ContextMenu","Backquote",...Array.from({length:11},(_,index)=>`F${index+1}`)];
const label=(key:string)=>({PageUp:"Page Up",PageDown:"Page Down",PrintScreen:"Print Screen",ContextMenu:"Menu / Application",Backquote:"Key beside 1 (`)"}[key]||key);
export function KeyboardSettings({draft,onChange,busy,onBusyChange}:{draft:Preferences;onChange:(draft:Preferences)=>void;busy:boolean;onBusyChange:(value:boolean)=>void}) {
  const [recording,setRecording]=useState<Binding["action"]|null>(null);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [browser,setBrowser]=useState("brave");
  const [working,setWorking]=useState(false);
  const [browserMessage,setBrowserMessage]=useState("");
  const [browserError,setBrowserError]=useState("");
  const [connection,setConnection]=useState<{connected:boolean;ready:boolean}|null>(null);
  const bindings=draft.singleKeyBindings||[];
  useEffect(()=>{onBusyChange(working||recording!==null);return()=>onBusyChange(false);},[working,recording,onBusyChange]);
  const assign=(action:Binding["action"],key:string)=>{
    if(key && bindings.some(binding=>binding.key===key && binding.action!==action)){setError(`${label(key)} is already assigned. Clear its other action first.`);return;}
    onChange({...draft,singleKeyBindings:[...bindings.filter(binding=>binding.action!==action),...(key?[{key,action}]:[])]});setError("");setMessage(key?`${label(key)} selected for ${actions.find(item=>item[0]===action)?.[1]}. Save settings to apply.`:"Key cleared. Save settings to apply.");
  };
  useEffect(()=>{
    if(!recording)return;
    const keydown=(event:KeyboardEvent)=>{
      event.preventDefault();event.stopImmediatePropagation();
      if(event.key==="Escape"){setRecording(null);return;}
      if(event.ctrlKey||event.altKey||event.shiftKey||event.metaKey){setError("Press one key without Ctrl, Shift, Alt or Windows.");return;}
      if(!keys.includes(event.code)){setError("Choose one of the supported keys below. Fn and F12 cannot be assigned.");return;}
      assign(recording,event.code);setRecording(null);
    };
    window.addEventListener("keydown",keydown,true);return()=>window.removeEventListener("keydown",keydown,true);
  });
  useEffect(()=>{let active=true;const refresh=()=>void invoke<{connected:boolean;ready:boolean}>("browser_control_status").then(value=>{if(active)setConnection(value);}).catch(()=>{});refresh();const timer=setInterval(refresh,2000);return()=>{active=false;clearInterval(timer);};},[]);
  const record=async(action:Binding["action"])=>{
    setWorking(true);setError("");
    try{await invoke("disarm");onChange({...draft,singleKeyEnabled:false});setRecording(action);setMessage("Single-key mode is off while recording. Press a key, or Escape to cancel.");}
    catch(error){setError(String(error));}finally{setWorking(false);}
  };
  return <>
    <fieldset className="settings-section keyboard-settings" disabled={busy||working}>
      <legend>Single-key capture</legend>
      <p className="settings-description">Assign spare keys on any standard Windows keyboard. Assigned keys replace their normal action while this mode is on, including while SnipyNest is in the tray.</p>
      <label className="preference-toggle"><span>Enable single-key mode<small>Only your assigned bare keys are reserved. Ctrl/Shift combinations stay available.</small></span><input type="checkbox" checked={draft.singleKeyEnabled??false} onChange={event=>onChange({...draft,singleKeyEnabled:event.target.checked})}/></label>
      {actions.map(([action,title])=><div className="key-binding" key={action}>
        <label htmlFor={`key-${action}`}>{title}</label>
        <div className="key-binding-controls"><select id={`key-${action}`} value={bindings.find(binding=>binding.action===action)?.key||""} onChange={event=>assign(action,event.target.value)}><option value="">Not assigned</option>{keys.map(key=><option key={key} value={key}>{label(key)}</option>)}</select><button type="button" className="button" aria-label={`Record key for ${title}`} aria-pressed={recording===action} onClick={()=>void record(action)}>{recording===action?"Press key…":"Record"}</button></div>
      </div>)}
      <label className="preference-toggle"><span>Enable again at app startup<small>Otherwise mappings are saved and single-key mode starts off.</small></span><input type="checkbox" checked={draft.singleKeyResume??false} onChange={event=>onChange({...draft,singleKeyResume:event.target.checked})}/></label>
      <button type="button" className="button" onClick={()=>void invoke("disarm").then(()=>{onChange({...draft,singleKeyEnabled:false});setMessage("Keys released immediately.");}).catch(error=>setError(String(error)))}>Release keys now</button>
      <p className="settings-description">Save settings to apply assignments. Exit the app or use the tray’s Disable single-key mode command to restore your keys. Print Screen may already be owned by Windows or another app.</p>
      <p role="status">{message}</p>{error&&<p role="alert" className="error-text">{error}</p>}
      {recording&&<button type="button" className="text-button" onClick={()=>setRecording(null)}>Cancel recording</button>}
    </fieldset>
    <fieldset className="settings-section" disabled={busy||working}>
      <legend>Browser keys</legend>
      <p className="settings-description">Connect Companion to use a single key for browser PNG/PDF capture. Browser access is optional and enabled separately in the extension.</p>
      <label className="preference-toggle"><span>Browser</span><select aria-label="Browser for desktop keys" value={browser} onChange={event=>setBrowser(event.target.value)}><option value="brave">Brave</option><option value="chrome">Chrome</option><option value="edge">Edge</option></select></label>
      <button type="button" className="button" onClick={()=>{setWorking(true);setBrowserError("");setBrowserMessage("Preparing browser helper…");void invoke<string>("install_browser_control",{browser}).then(setBrowserMessage).catch(error=>{setBrowserMessage("");setBrowserError(String(error));}).finally(()=>setWorking(false));}}>Set up browser connection</button>
      <p role="status">{browserMessage}</p>{browserError&&<p role="alert" className="error-text">{browserError}</p>}
      <p role="status" className="settings-description">{connection?.ready?"Companion connected; browser keys are permitted.":connection?.connected?"Companion connected; finish access setup in extension Settings.":"Companion not connected. Set up the helper here, then connect in extension Settings."}</p>
    </fieldset>
  </>;
}
