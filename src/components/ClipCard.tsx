import {
  Pin,
  Trash2,
  Copy,
  Crop,
  GripVertical,
  Undo2,
  Image as ImageIcon,
  FileText,
  Code2,
  Link2,
} from "lucide-react";
import type { Clip } from "../types/clip";
import { formatBytes, clipDate } from "../lib/format";
import { useNativeDrag } from "../lib/useNativeDrag";
import { useClipPreview } from "../lib/useClipPreview";
interface Props {
  clip: Clip;
  isSelected: boolean;
  isFocused?: boolean;
  shortcutNumber?: number;
  busy?: boolean;
  onSelect: (id: string, multi: boolean) => void;
  onCopy: (clip: Clip) => void;
  onTogglePin: (id: string) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onOpenAnnotator: (clip: Clip) => void;
  onNativeDrag: (id: string) => void;
  isTrashView?: boolean;
}
export function ClipCard({
  clip,
  isSelected,
  isFocused = false,
  shortcutNumber,
  busy,
  onSelect,
  onCopy,
  onTogglePin,
  onTrash,
  onRestore,
  onPermanentDelete,
  onOpenAnnotator,
  onNativeDrag,
  isTrashView = false,
}: Props) {
  const preview = useClipPreview(clip);
  const drag = useNativeDrag(() => {
    if (!busy && !isTrashView) onNativeDrag(clip.id);
  });
  const Icon =
    clip.clip_type === "image"
      ? ImageIcon
      : clip.clip_type === "code"
        ? Code2
        : clip.clip_type === "link"
          ? Link2
          : FileText;
  return (
    <article
      className={
        "clip-card" +
        (isSelected ? " selected" : "") +
        (isFocused ? " focused" : "")
      }
      aria-label={
        clip.clip_type + " clip from " + (clip.source_app || "Unknown app")
      }
    >
      <div className="clip-meta">
        <label className="select-clip">
          <input
            type="checkbox"
            aria-label="Select clip"
            checked={isSelected}
            onChange={() => onSelect(clip.id, true)}
          />
        </label>
        <Icon size={14} className="muted" />
        <span
          className="clip-source"
          title={clip.source_title || clip.source_app}
        >
          {clip.source_app?.replace(/\.exe$/i, "") || "Clipboard"}
        </span>
        <time title={new Date(clip.created_at).toLocaleString()}>
          {clipDate(clip.created_at)}
        </time>
        {!isTrashView && (
          <button
            className={
              "icon-button compact " + (clip.is_pinned ? "is-active" : "")
            }
            aria-label={clip.is_pinned ? "Unpin clip" : "Pin clip"}
            aria-pressed={clip.is_pinned}
            onClick={() => onTogglePin(clip.id)}
            disabled={busy}
          >
            <Pin size={14} />
          </button>
        )}
      </div>
      {clip.clip_type === "image" ? (
        <div className="clip-image" {...(!isTrashView ? drag : {})}>
          {preview ? (
            <img
              src={preview}
              alt={clip.source_title || "Clipboard image"}
              draggable={false}
            />
          ) : (
            <span className="muted">Image preview unavailable</span>
          )}
          {clip.dimensions && (
            <span className="image-dimensions">{clip.dimensions}</span>
          )}
        </div>
      ) : (
        <p
          className={
            "clip-text " +
            (clip.clip_type === "code"
              ? "code"
              : clip.clip_type === "link"
                ? "link"
                : "")
          }
          title={clip.text_content}
        >
          {clip.text_content || "Empty clip"}
        </p>
      )}
      <div className="clip-footer">
        <span className="clip-size">
          {clip.clip_type === "image"
            ? formatBytes(clip.byte_size)
            : clip.char_count.toLocaleString() + " characters"}
        </span>
        <div className="clip-actions">
          {isTrashView ? (
            <>
              <button
                className="text-button"
                onClick={() => onRestore(clip.id)}
                disabled={busy}
              >
                <Undo2 size={14} />
                Restore
              </button>
              <button
                className="icon-button danger"
                aria-label="Delete clip permanently"
                onClick={() => onPermanentDelete(clip.id)}
                disabled={busy}
              >
                <Trash2 size={15} />
              </button>
            </>
          ) : (
            <>
              <button
                className="icon-button drag-handle"
                {...drag}
                aria-label="Drag clip to another app"
                title="Drag to another app"
                disabled={busy}
              >
                <GripVertical size={16} />
              </button>
              {clip.clip_type === "image" && (
                <button
                  className="icon-button"
                  aria-label="Edit image"
                  title="Crop and annotate"
                  onClick={() => onOpenAnnotator(clip)}
                  disabled={busy}
                >
                  <Crop size={16} />
                </button>
              )}
              <button
                className="icon-button"
                aria-label="Move clip to Trash"
                title="Move to Trash"
                onClick={() => onTrash(clip.id)}
                disabled={busy}
              >
                <Trash2 size={15} />
              </button>
              <button
                className="text-button copy-button"
                onClick={() => onCopy(clip)}
                disabled={busy}
              >
                <Copy size={14} />
                Copy{shortcutNumber && <kbd>{shortcutNumber}</kbd>}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
