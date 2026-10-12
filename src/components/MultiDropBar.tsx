import { GripVertical, FolderDown, Trash2, X, Undo2 } from "lucide-react";
import { useNativeDrag } from "../lib/useNativeDrag";
interface Props {
  selectedCount: number;
  busy: boolean;
  isTrash: boolean;
  onClearSelection: () => void;
  onExportSelected: () => void;
  onTrashSelected: () => void;
  onRestoreSelected: () => void;
  onNativeDrag: () => void;
}
export function MultiDropBar({
  selectedCount,
  busy,
  isTrash,
  onClearSelection,
  onExportSelected,
  onTrashSelected,
  onRestoreSelected,
  onNativeDrag,
}: Props) {
  const drag = useNativeDrag(() => {
    if (!busy) onNativeDrag();
  });
  if (!selectedCount) return null;
  return (
    <section className="selection-bar" aria-label="Selected clips">
      <div>
        <strong>{selectedCount} selected</strong>
        <button
          className="icon-button compact"
          aria-label="Clear selection"
          onClick={onClearSelection}
        >
          <X size={15} />
        </button>
      </div>
      <div>
        {isTrash ? (
          <button
            className="text-button"
            onClick={onRestoreSelected}
            disabled={busy}
          >
            <Undo2 size={15} />
            Restore
          </button>
        ) : (
          <>
            <button
              className="text-button drag-handle"
              {...drag}
              disabled={busy}
            >
              <GripVertical size={16} />
              Drag
            </button>
            <button
              className="text-button"
              onClick={onExportSelected}
              disabled={busy}
            >
              <FolderDown size={15} />
              Export
            </button>
            <button
              className="text-button"
              aria-label="Move selected clips to Trash"
              onClick={onTrashSelected}
              disabled={busy}
            >
              <Trash2 size={16} /> Move to Trash
            </button>
          </>
        )}
      </div>
    </section>
  );
}
