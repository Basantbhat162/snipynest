import {useEffect, useRef, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {AnnotatorModal} from "./AnnotatorModal";
import type {Clip} from "../types/clip";
import type {Rectangle} from "../annotation/geometry";
import "../App.css";

type Snapshot = {id: string; image: string; screens?: Rectangle[]};
export function RegionCapture() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const revision = ++generation.current;
      try {
        const next = await invoke<Snapshot | null>("get_region_capture_snapshot");
        if (active && revision === generation.current) { setSnapshot(next); setError(""); }
      } catch (error) { if (active) setError(String(error)); }
    };
    const started = listen("region-start", () => {void refresh();});
    const cleared = listen("region-cleared", () => {++generation.current; setSnapshot(null);});
    void Promise.all([started, cleared]).then(() => {if (active) void refresh();});
    return () => {active = false; ++generation.current; void started.then(fn => fn()); void cleared.then(fn => fn());};
  }, []);
  if (!snapshot) return error ? <p role="alert">{error}</p> : null;
  const clip: Clip = {id: snapshot.id, hash: "", clip_type: "image", char_count: 0, byte_size: 0, created_at: new Date().toISOString(), is_pinned: false, is_deleted: false};
  const finish = async (clip?: Clip) => {
    await invoke("finish_region_capture", {id: snapshot.id, clipId: clip?.id ?? null});
    setSnapshot(null);
  };
  return <AnnotatorModal key={snapshot.id} regionCapture={snapshot} quickCrop clip={clip}
    onClose={() => setSnapshot(null)}
    onCopyResult={async dataBase64 => {
      const saved = await invoke<Clip | null>("copy_region_capture", {id: snapshot.id, dataBase64});
      await finish(saved ?? undefined);
    }}
    onSave={async dataBase64 => {
      const saved = await invoke<Clip>("save_annotated_image", {dataBase64, originalId: null});
      await finish(saved);
    }}/>
}
