import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Clipboard, X, History, Crop } from "lucide-react";
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
  const busyRef = useRef(false);
  const interaction = () => { void invoke("set_pad_interacting", {active:hovered.current || focused.current || busyRef.current}).catch(e=>setError(String(e))); };
  useEffect(() => { interaction(); }, [busy]);

  const move = useNativeDrag(() => {
    void invoke("move_utility_window").catch(e => setError(String(e)));
  });
  const dismiss = () => { void invoke("dismiss_capture_pad").catch(e => setError(String(e))); };
  const drag = useNativeDrag(() => {
    if (!clip || busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError("");
    suppressClickUntil.current = Infinity;
    void invoke("start_native_drag", { clipIds: [clip.id] }).catch(e => setError(String(e))).finally(() => { suppressClickUntil.current=Date.now()+500; busyRef.current = false; setBusy(false); });
  });
  useEffect(() => {
    let active = true;
    let revision = 0;
    const reload = async () => {
      const request = ++revision;
      const [clips, unread, prefs] = await Promise.all([
        invoke<Clip[]>("get_clips", { filter: { clip_type: "capture", limit: 1, offset: 0 } }),
        invoke<number>("get_pad_unread"), invoke<Preferences>("get_preferences")]);
      if (active && request === revision) { setClip(clips[0] || null); setCount(unread); setPreferences(prefs); setError(""); }
    };
    const resetInteraction = () => {
      hovered.current = false;
      focused.current = false;
      interaction();
    };
    const subscriptions = [
      listen("pad-updated", () => { void reload().catch(e => active && setError(String(e))); setPulse(true); }),
      listen("pad-read", () => setCount(0)),
      listen<Preferences>("preferences-changed", e => setPreferences(e.payload))
    ];
    // Read after subscriptions attach so an arrival cannot fall into the startup gap.
    void Promise.all(subscriptions).then(() => reload()).catch(e => active && setError(String(e)));
    window.addEventListener("blur", resetInteraction);
    return () => {
      active = false;
      window.removeEventListener("blur", resetInteraction);
      subscriptions.forEach(p => void p.then(f => f()).catch(() => {}));
    };
  }, []);
  return <main onPointerEnter={() => {hovered.current=true;interaction();}} onPointerLeave={() => {hovered.current=false;interaction();}} onFocus={() => {focused.current=true;interaction();}} onBlur={e => {if (!e.currentTarget.contains(e.relatedTarget as Node)) {focused.current=false;interaction();}}} className={"capture-pad " + (pulse && !preferences?.padPrivacy ? "arrived" : "")} onAnimationEnd={() => setPulse(false)} onKeyDown={e => { if(e.key === "Escape") dismiss(); }}>
    <button className="pad-image" {...drag} disabled={busy} title="Click to open capture. Drag to share." aria-label="Open latest capture or drag to share" onClick={() => {
      if(busy || Date.now()<=suppressClickUntil.current) return;
      const request = clip?.clip_type === "file" ? invoke("open_clip_file",{id:clip.id}) : invoke("open_from_pad", clip ? {quickCropId:clip.id} : {});
      void request.catch(e => setError(String(e)));
    }}>
      {preview && !preferences?.padPrivacy ? <img src={preview} draggable={false} alt={clip?.clip_type === "file" ? "Latest PDF capture" : "Latest captured image"}/> : <span className="pad-placeholder"><Clipboard size={24}/><span>{preferences?.padPrivacy ? "Capture saved" : "Your captures"}</span></span>}
      {clip?.clip_type === "file" && !preferences?.padPrivacy && <span className="pad-file-label">PDF</span>}
      {(busy || preferences?.capturePaused || count > 0) && <span className="pad-badge" role="status" aria-label={busy ? "Sharing image" : preferences?.capturePaused ? "Capture paused" : `${count} new captures`}>{busy ? "Sharing…" : preferences?.capturePaused ? "Paused" : count > 99 ? "99+" : count}</span>}
    </button>
    <nav className="pad-controls" aria-label="Capture Pad controls">
      <button className="pad-crop" disabled={busy || !clip || clip.clip_type !== "image"} aria-label="Quick crop latest image" title="Quick crop · Ctrl+C to copy, Ctrl+S to save" onClick={() => { if (busyRef.current || !clip || clip.clip_type !== "image") return; void invoke("open_from_pad", {quickCropId:clip.id}).catch(e => setError(String(e))); }}><Crop size={17}/></button>
      <button className="pad-history" disabled={busy} aria-label="Open clipboard history" title="Open history" onClick={() => {if (busyRef.current) return; void invoke("open_from_pad").catch(e => setError(String(e)));}}><History size={17}/></button>
      <button className="pad-close" aria-label="Dismiss Capture Pad" title="Hide Pad (Escape)" onClick={dismiss}><X size={17}/></button>
    </nav>
    <div className="pad-move-edge" aria-label="Move Capture Pad" title="Drag edge to move" {...move}/>
    {error && <p role="alert" title={error}>{error}</p>}
  </main>;
}
