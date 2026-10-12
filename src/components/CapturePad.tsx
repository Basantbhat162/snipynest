import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Clipboard, GripHorizontal, X } from "lucide-react";
import { useNativeDrag } from "../lib/useNativeDrag";
import { useClipPreview } from "../lib/useClipPreview";
import type { Clip, Preferences } from "../types/clip";
import "../App.css";
import "./CapturePad.css";
export function CapturePad() {
  const [clip, setClip] = useState<Clip | null>(null);
  const [count, setCount] = useState(0);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pulse, setPulse] = useState(false);
  const preview = useClipPreview(preferences?.padPrivacy ? null : clip);
  const suppressClickUntil = useRef(0);
  const hovered = useRef(false);
  const focused = useRef(false);
  const interaction = () => { void invoke("set_pad_interacting", {active:hovered.current || focused.current || busy}).catch(e=>setError(String(e))); };
  useEffect(() => { interaction(); }, [busy]);

  const move = useNativeDrag(() => {
    void invoke("move_utility_window").catch(e => setError(String(e)));
  });
  const dismiss = () => { void invoke("dismiss_capture_pad").catch(e => setError(String(e))); };
  const drag = useNativeDrag(() => {
    if (!clip || busy) return;
    setBusy(true); setError("");
    suppressClickUntil.current = Infinity;
    void invoke("start_native_drag", { clipIds: [clip.id] }).catch(e => setError(String(e))).finally(() => { suppressClickUntil.current=Date.now()+500; setBusy(false); });
  });
  useEffect(() => {
    let active = true;
    const reload = async () => {
      const [clips, unread, prefs] = await Promise.all([
        invoke<Clip[]>("get_clips", { filter: { clip_type: "image", limit: 1, offset: 0 } }),
        invoke<number>("get_pad_unread"), invoke<Preferences>("get_preferences")]);
      if (active) { setClip(clips[0] || null); setCount(unread); setPreferences(prefs); }
    };
    void reload().catch(e => setError(String(e)));
    const subscriptions = [listen("pad-updated", () => { void reload().catch(e=>setError(String(e))); setPulse(true); }), listen("pad-read", () => setCount(0)), listen<Preferences>("preferences-changed", e => setPreferences(e.payload))];
    return () => { active = false; subscriptions.forEach(p => void p.then(f => f()).catch(() => {})); };
  }, []);
  return <main onPointerEnter={() => {hovered.current=true;interaction();}} onPointerLeave={() => {hovered.current=false;interaction();}} onFocus={() => {focused.current=true;interaction();}} onBlur={e => {if (!e.currentTarget.contains(e.relatedTarget as Node)) {focused.current=false;interaction();}}} className={"capture-pad " + (pulse && !preferences?.padPrivacy ? "arrived" : "")} onAnimationEnd={() => setPulse(false)} onKeyDown={e => { if(e.key === "Escape") dismiss(); }}>
    <header><button className="pad-move" aria-label="Move Capture Pad" title="Drag this bar to move the Pad" {...move}><GripHorizontal size={16}/><span>{preferences?.capturePaused ? "Paused" : count ? `${Math.min(count, 99)} new` : "SnipyNest"}</span></button><button className="pad-close" aria-label="Dismiss Capture Pad" title="Hide Pad (Escape)" onClick={dismiss}><X size={16}/></button></header>
    <button className="pad-image" {...drag} disabled={busy} title="Click to open history. Drag to share the latest image." aria-label="Open clipboard history or drag latest image" onClick={() => { if(!busy && Date.now()>suppressClickUntil.current) void invoke("open_from_pad").catch(e => setError(String(e))); }}>
      {preview && !preferences?.padPrivacy ? <img src={preview} draggable={false} alt="Latest captured image"/> : <Clipboard size={28}/>}
    </button>
    {error && <p role="alert" title={error}>{error}</p>}
  </main>;
}
