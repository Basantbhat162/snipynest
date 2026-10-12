import {
  Clipboard,
  Pin,
  Search,
  Settings2,
  X,
  GripHorizontal,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useNativeDrag } from "../lib/useNativeDrag";
interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onOpenHousekeeping: () => void;
  onClose: () => void;
}
export function SidebarHeader({
  search,
  onSearchChange,
  isPinned,
  onTogglePin,
  onOpenHousekeeping,
  onClose,
}: Props) {
  const move = useNativeDrag(() => { void invoke("move_utility_window").catch(console.error); });
  return (
    <header className="sidebar-header">
      <div className="titlebar">
        <div
          className="window-handle"
          {...move}
          title="Drag to move window"
        >
          <Clipboard size={19} className="brand-icon" />
          <h1>SnipyNest</h1>
          <GripHorizontal size={15} className="muted" />
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            onClick={onOpenHousekeeping}
            aria-label="Settings and storage"
            title="Settings and storage"
          >
            <Settings2 size={17} />
          </button>
          <button
            className={"icon-button " + (isPinned ? "is-active" : "")}
            onClick={onTogglePin}
            aria-pressed={isPinned}
            aria-label={isPinned ? "Switch to Peek mode" : "Keep sidebar open"}
            title={
              isPinned
                ? "Pinned mode: stays open"
                : "Peek mode: hides on focus loss"
            }
          >
            <Pin size={17} />
          </button>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Hide sidebar"
            title="Hide sidebar (Escape)"
          >
            <X size={19} />
          </button>
        </div>
      </div>
      <div className="search-field">
        <Search size={17} aria-hidden="true" />
        <input
          id="clip-search"
          type="search"
          aria-label="Search clipboard history"
          placeholder="Search your clipboard…"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {search ? (
          <button
            className="icon-button"
            aria-label="Clear search"
            onClick={() => onSearchChange("")}
          >
            <X size={15} />
          </button>
        ) : (
          <kbd>Ctrl K</kbd>
        )}
      </div>
    </header>
  );
}
