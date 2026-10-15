export type ClipType = "text" | "image" | "link" | "code" | "file";

export interface Clip {
  id: string;
  hash: string;
  clip_type: ClipType;
  text_content?: string;
  char_count: number;
  byte_size: number;
  dimensions?: string;
  source_app?: string;
  source_title?: string;
  created_at: string;
  is_pinned: boolean;
  is_deleted: boolean;
  deleted_at?: string;
  thumbnail?: string; // Base64 data URL
  file_path?: string; // Absolute on-disk path for images/files
}

export interface ClipFilter {
  search?: string;
  clip_type?: string;
  pinned_only?: boolean;
  trash_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface StorageStats {
  total_clips: number;
  text_clips: number;
  image_clips: number;
  pinned_clips: number;
  trash_clips: number;
  total_bytes: number;
}

export interface Preferences {
  capturePaused: boolean;
  trashRetentionDays: number;
  startAtLogin: boolean;
  snipShortcut?: string;
  quickCaptureShortcut?: string;
  historyShortcut?: string;
  padMode?: "arrival" | "always" | "off";
  padPrivacy?: boolean;
  hideDuringDrag?: boolean;
  captureSound?: boolean;
  soundVolume?: number;
  padHideSeconds?: number;
  padOnHistoryClose?: boolean;
}
