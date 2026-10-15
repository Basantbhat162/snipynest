// Development-only verification fixture. Excluded from the production entry/build.
import React from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import type { Clip } from "../src/types/clip";
const canvas = document.createElement("canvas");
canvas.width = 960;
canvas.height = 600;
const ctx = canvas.getContext("2d")!;
ctx.fillStyle = "#e6edf2";
ctx.fillRect(0, 0, 960, 600);
ctx.fillStyle = "#223749";
ctx.fillRect(55, 50, 850, 100);
ctx.fillStyle = "#ffffff";
ctx.font = "32px Segoe UI";
ctx.fillText("Project notes", 85, 112);
ctx.fillStyle = "#527a91";
ctx.fillRect(55, 190, 400, 300);
ctx.fillStyle = "#a9c2cf";
ctx.fillRect(490, 190, 415, 140);
ctx.fillStyle = "#36566a";
ctx.font = "24px Segoe UI";
ctx.fillText("A full-resolution test image", 495, 390);
const image = canvas.toDataURL("image/png");
let clips: Clip[] = Array.from({ length: 125 }, (_, i) => ({
  id: String(i),
  hash: "a".repeat(64),
  clip_type:
    i % 5 === 0
      ? "image"
      : i % 5 === 1
        ? "text"
        : i % 5 === 2
          ? "code"
          : "link",
  text_content:
    i % 5 === 1
      ? "Remember to review the updated proposal before Friday. The client asked for a simpler onboarding flow."
      : i % 5 === 2
        ? "const selection = history.filter(clip => clip.is_pinned);"
        : "https://example.com/research/clipboard-workflows",
  char_count: 125,
  byte_size: 24800,
  dimensions: i % 5 === 0 ? "960 × 600" : undefined,
  source_app: i % 5 === 0 ? "Chrome.exe" : "Code.exe",
  source_title: "Verification fixture",
  created_at: new Date(Date.now() - i * 3600000).toISOString(),
  is_pinned: i === 2,
  is_deleted: i > 121,
  thumbnail: i % 5 === 0 ? image : undefined,
}));
let pinned = true;
const isPad = new URLSearchParams(location.search).get("surface") === "pad";
let preferences = {
  capturePaused: false,
  trashRetentionDays: 30,
  startAtLogin: false,
  padMode: "arrival",
  padPrivacy: false,
};
mockWindows(isPad ? "capture-pad" : "main");
mockIPC(
  async (command, payload: any) => {
    switch (command) {
      case "get_pad_unread": return 3;
      case "dismiss_capture_pad":
      case "move_utility_window":
      case "open_from_pad": {
        const status = document.getElementById("fixture-status");
        if (status) status.textContent = `Fixture command: ${command}`;
        return;
      }
      case "get_preferences":
        return preferences;
      case "update_preferences":
        preferences = payload.preferences;
        return preferences;
      case "get_clips": {
        const f = payload.filter;
        let result = clips.filter(
          (c) =>
            c.is_deleted === !!f.trash_only &&
            (!f.pinned_only || c.is_pinned) &&
            (!f.clip_type || c.clip_type === f.clip_type) &&
            (!f.search ||
              (c.text_content || "")
                .toLowerCase()
                .includes(f.search.toLowerCase())),
        );
        return result.slice(f.offset || 0, (f.offset || 0) + f.limit);
      }
      case "get_storage_stats":
        return {
          total_clips: clips.filter((c) => !c.is_deleted).length,
          image_clips: 25,
          text_clips: 97,
          pinned_clips: clips.filter((c) => c.is_pinned).length,
          trash_clips: clips.filter((c) => c.is_deleted).length,
          total_bytes: 15728640,
        };
      case "get_sidebar_pinned":
        return pinned;
      case "set_sidebar_pinned":
        pinned = payload.pinned;
        return;
      case "get_clip_full_image":
        return image;
      case "copy_clip_to_clipboard":
        return new URLSearchParams(location.search).get("copyFail") !== "1";
      case "copy_image_base64_to_clipboard":
        return true;
      case "toggle_clip_pin": {
        const c = clips.find((c) => c.id === payload.id)!;
        c.is_pinned = !c.is_pinned;
        return c.is_pinned;
      }
      case "trash_clip":
        clips.find((c) => c.id === payload.id)!.is_deleted = true;
        return;
      case "restore_clip":
        clips.find((c) => c.id === payload.id)!.is_deleted = false;
        return;
      case "delete_clip_permanently":
        clips = clips.filter((c) => c.id !== payload.id);
        return;
      case "empty_trash":
        clips = clips.filter((c) => !c.is_deleted);
        return;
      case "save_annotated_image": {
        const saved = {
          ...clips[0],
          id: "edited-" + Date.now(),
          thumbnail: payload.dataBase64,
        };
        clips.unshift(saved);
        await emit("new-clip", saved);
        return saved;
      }
      case "export_clips_with_picker":
        return payload.clipIds.length;
      case "start_native_drag": {
        const dropped = new URLSearchParams(location.search).get("dropSuccess") === "1";
        await emit("native-drag-end", { dropped });
        return dropped;
      }
      default:
        return;
    }
  },
  { shouldMockEvents: true },
);
const { App } = await import("../src/App");
const { CapturePad } = await import("../src/components/CapturePad");
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isPad ? <><div style={{ width:216, height:88 }}><CapturePad /></div><p id="fixture-status" role="status">Pad fixture: native actions are simulated</p></> : <App />}
  </React.StrictMode>,
);
