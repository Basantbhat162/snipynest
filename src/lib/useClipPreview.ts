import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Clip } from "../types/clip";

// Cards are virtualized; only mounted image cards request a sharper preview.
// Native decoding is serialized and previews are cached on disk beside each blob.
export function useClipPreview(clip: Clip | null) {
  const [loaded, setLoaded] = useState<{hash:string; image:string} | null>(null);
  useEffect(() => {
    if (!clip || clip.clip_type !== "image") return;
    let active = true;
    void invoke<string | null>("get_clip_preview", { id:clip.id }).then(image => {
      if (active && image) setLoaded({hash:clip.hash,image});
    }).catch(() => { /* Keep the stored thumbnail when the original is unavailable. */ });
    return () => { active = false; };
  }, [clip?.id, clip?.hash, clip?.clip_type]);
  return loaded?.hash === clip?.hash ? loaded?.image : clip?.thumbnail;
}
