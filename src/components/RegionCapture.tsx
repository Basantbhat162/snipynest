import {useEffect, useRef, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {AnnotatorModal} from "./AnnotatorModal";
import type {Clip} from "../types/clip";
import type {Rectangle} from "../annotation/geometry";
import "../App.css";

type Snapshot = {id: string; image: string; screens?: Rectangle[]; sourceDecoded?:()=>void};
export function RegionCapture() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    let imageUrl: string | null = null;
    let requestedId: string | null = null;
    const release = () => { if (imageUrl) URL.revokeObjectURL(imageUrl); imageUrl = null; };
    const refresh = async () => {
      const revision = ++generation.current;
      try {
        const next = await invoke<Omit<Snapshot, "image"> | null>("get_region_capture_snapshot");
        if (!active || revision !== generation.current) return;
        if (!next) { requestedId=null; release(); setSnapshot(null); return; }
        requestedId=next.id;
        const pixels = await invoke<ArrayBuffer>("get_region_capture_frame", {id: next.id});
        if (!active || revision !== generation.current) return;
        release();
        imageUrl = URL.createObjectURL(new Blob([pixels], {type: "image/bmp"}));
        const source=imageUrl;
        setSnapshot({...next, image: source, sourceDecoded:()=>{URL.revokeObjectURL(source);if(imageUrl===source)imageUrl=null;}}); setError("");
      } catch (error) { if (active && revision===generation.current) setError(String(error)); }
    };
    const started = listen<string>("region-start", event => {requestedId=event.payload;void refresh();});
    const cleared = listen<string>("region-cleared", event => {
      if(requestedId!==event.payload)return;
      ++generation.current;requestedId=null;release();
      setSnapshot(current=>current?.id===event.payload?null:current);
    });
    void Promise.all([started, cleared]).then(() => {if (active) void refresh();});
    return () => {active = false; ++generation.current; release(); void started.then(fn => fn()); void cleared.then(fn => fn());};
  }, []);
  if (!snapshot) return error ? <p role="alert">{error}</p> : null;
  const clip: Clip = {id: snapshot.id, hash: "", clip_type: "image", char_count: 0, byte_size: 0, created_at: new Date().toISOString(), is_pinned: false, is_deleted: false};
  const finish = async (clip?: Clip) => {
    await invoke("finish_region_capture", {id: snapshot.id, clipId: clip?.id ?? null});
    setSnapshot(current=>current?.id===snapshot.id?null:current);
  };
  return <AnnotatorModal key={snapshot.id} regionCapture={snapshot} quickCrop clip={clip}
    onClose={() => setSnapshot(current=>current?.id===snapshot.id?null:current)}
    onCopyResult={async dataBase64 => {
      await invoke("copy_region_capture", {id: snapshot.id, dataBase64});
      setSnapshot(current=>current?.id===snapshot.id?null:current);
    }}
    onCopySelection={async selection => { await invoke("copy_region_capture", {id: snapshot.id, selection}); setSnapshot(current=>current?.id===snapshot.id?null:current); }}
    onSave={async dataBase64 => {
      const saved = await invoke<Clip>("save_annotated_image", {dataBase64, originalId: null});
      await finish(saved);
    }}/>
}
