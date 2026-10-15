import {
  useState,
  useEffect,
  useRef,
  useSyncExternalStore,
  useCallback,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Clipboard,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  Check,
  AlertCircle,
  ScanLine,
  Pause,
} from "lucide-react";
import { SidebarHeader } from "./components/SidebarHeader";
import { CategoryTabs } from "./components/CategoryTabs";
import type { Category } from "./components/CategoryTabs";
import { ClipCard } from "./components/ClipCard";
import { MultiDropBar } from "./components/MultiDropBar";
import { HousekeepingModal } from "./components/HousekeepingModal";
import { AnnotatorModal } from "./components/AnnotatorModal";
import { selectionAfterDrop } from "./lib/selection";
import { readDraft } from "./annotation/drafts";
import { Dialog } from "./components/Dialog";
import { HistoryController, PAGE_SIZE } from "./lib/history";
import type { Clip, StorageStats, Preferences } from "./types/clip";
import "./App.css";

type Notice = { message: string; error?: boolean; undoIds?: string[]; undoBatch?: string };
const labels: Record<Category, string> = {
  all: "All clips",
  image: "Images",
  text: "Text",
  code: "Code",
  link: "Links",
  pinned: "Pinned clips",
  trash: "Trash",
};
export function App() {
  const [recoverableClip, setRecoverableClip] = useState<Clip | null>(null);
  useEffect(() => { void readDraft().then(draft=>setRecoverableClip(draft?.clip ?? null)).catch(()=>{}); }, []);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [history] = useState(
    () =>
      new HistoryController((filter) =>
        invoke<Clip[]>("get_clips", { filter }),
      ),
  );
  const { clips, loading, error, hasNext } = useSyncExternalStore(
    history.subscribe,
    history.getSnapshot,
  );
  const [category, setCategory] = useState<Category>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isPinned, setIsPinned] = useState(false);
  const [annotatingClip, setAnnotatingClip] = useState<Clip | null>(null);
  const [showStorage, setShowStorage] = useState(false);
  const [batch, setBatch] = useState<{token:string;count:number}|null>(null);
  const [includePinned, setIncludePinned] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const dragPending = useRef(false);
  const [busy, setBusy] = useState(false);
  const parentRef = useRef<HTMLDivElement | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const current = useRef({ category, search, page });
  current.current = { category, search, page };
  const modalOpen = !!annotatingClip || showStorage || !!deleteId || !!batch;
  const refreshStats = useCallback(async () => {
    try {
      setStats(await invoke<StorageStats>("get_storage_stats"));
    } catch (e) {
      setNotice({
        message: "Could not read storage information: " + String(e),
        error: true,
      });
    }
  }, []);
  const refresh = useCallback(async () => {
    const q = current.current;
    await history.load(q.category, q.search, q.page, true);
    await refreshStats();
  }, [history, refreshStats]);
  const report = (error: unknown) =>
    setNotice({
      message: error instanceof Error ? error.message : String(error),
      error: true,
    });
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const recover = () => { if(dragPending.current) void invoke<boolean>("get_interaction_status").then(active=>{if(!active){dragPending.current=false;setBusy(false);}}).catch(report); };
    window.addEventListener("focus",recover); return ()=>window.removeEventListener("focus",recover);
  }, []);
  const hide = () => void invoke("hide_sidebar").catch(report);
  useEffect(() => {
    const timer = setTimeout(
      () => {
        void history.load(category, search, page);
      },
      search.trim() ? 150 : 0,
    );
    setSelectedIds(new Set());
    setFocusedIndex(0);
    parentRef.current?.scrollTo({ top: 0 });
    return () => {
      clearTimeout(timer);
      history.invalidate();
    };
  }, [category, search, page, history]);
  useEffect(() => {
    void invoke<Preferences>("get_preferences")
      .then(setPreferences)
      .catch(report);
    void invoke<string | null>("get_shortcut_error").then(error=>{if(error)report(error);}).catch(report);
    void refreshStats();
    void invoke<boolean>("get_sidebar_pinned").then(setIsPinned).catch(report);
    const subscription = listen("new-clip", () => {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void refresh();
      }, 100);
    });
    const dragSubscription = listen<{ dropped: boolean; error?: string }>(
      "native-drag-end",
      (event) => {
        if (event.payload.error) report(event.payload.error);
      },
    );
    const captureErrorSubscription = listen<{ message: string }>(
      "capture-error",
      (event) => report(event.payload.message),
    );
    subscription.catch(report);
    dragSubscription.catch(report);
    captureErrorSubscription.catch(report);
    return () => {
      clearTimeout(refreshTimer.current);
      void subscription.then((unlisten) => unlisten()).catch(() => {});
      void dragSubscription.then((unlisten) => unlisten()).catch(() => {});
      void captureErrorSubscription
        .then((unlisten) => unlisten())
        .catch(() => {});
    };
  }, [refresh, refreshStats]);
  useEffect(() => {
    void invoke("set_interaction_active", { active: modalOpen }).catch(report);
    return () => {
      void invoke("set_interaction_active", { active: false }).catch(() => {});
    };
  }, [modalOpen]);
  useEffect(() => {
    setFocusedIndex((previous) =>
      Math.max(0, Math.min(previous, clips.length - 1)),
    );
    setSelectedIds(
      (previous) =>
        new Set(
          [...previous].filter((id) => clips.some((clip) => clip.id === id)),
        ),
    );
  }, [clips]);
  useEffect(() => {
    if (!notice || notice.error || notice.undoIds || notice.undoBatch) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const virtualizer = useVirtualizer({
    count: clips.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (clips[index]?.clip_type === "image" ? 258 : 170),
    getItemKey: (index) => clips[index]?.id ?? index,
    overscan: 5,
  });
  const select = (id: string, multi: boolean) =>
    setSelectedIds((previous) => {
      const next = new Set(multi ? previous : []);
      if (previous.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  function chooseCategory(next: Category) {
    if (next === category && page === 0) return;
    history.invalidate();
    setCategory(next);
    setPage(0);
  }
  function changeSearch(value: string) {
    if (value === search && page === 0) return;
    history.invalidate();
    setSearch(value);
    setPage(0);
  }
  async function copy(clip: Clip) {
    await run(async () => {
      const copied = await invoke<boolean>("copy_clip_to_clipboard", {
        id: clip.id,
      });
      if (!copied) throw new Error("Could not copy this clip. Try again.");
      setNotice({ message: "Copied to clipboard" });
      if (!isPinned) await invoke("hide_sidebar");
    });
  }
  async function mutate(command: string, id: string) {
    await run(async () => {
      await invoke(command, { id });
      await refresh();
    });
  }
  async function trash(ids: string[], all = false) {
    await run(async () => {
      setNotice(null);
      const filter = all ? { search, clip_type: ["all","pinned","trash"].includes(category) ? null : category, pinned_only: category === "pinned" } : null;
      const prepared = await invoke<{token:string;count:number}>("prepare_clip_batch", {filter, ids, includePinned});
      if (prepared.count) setBatch(prepared);
      else setNotice({message:"No matching clips selected. Pinned clips are excluded unless enabled."});
    });
  }
  async function confirmBatch() {
    if (!batch) return;
    await run(async () => {
      const count = await invoke<number>("trash_clip_batch", {token:batch.token});
      setNotice({message:count+" clips moved to Trash",undoBatch:batch.token});
      setBatch(null);setSelectedIds(new Set());setPage(0);
      await refresh();
    });
  }
  async function restore(ids: string[]) {
    await run(async () => {
      try {
        for (const id of ids) await invoke("restore_clip", { id });
        setNotice({
          message:
            ids.length === 1 ? "Clip restored" : ids.length + " clips restored",
        });
      } finally {
        await refresh();
      }
    });
  }
  function startDrag(ids: string[]) {
    if (busy || !ids.length) return;
    setBusy(true);
    dragPending.current = true;
    const selectionAtStart = selectedIds;
    void invoke<boolean>("start_native_drag", { clipIds: ids }).then(dropped => {
      setSelectedIds(current => selectionAfterDrop(current, selectionAtStart, ids, dropped));
    }).catch(report).finally(() => { dragPending.current = false; setBusy(false); });
  }
  async function exportSelected() {
    await run(async () => {
      const count = await invoke<number | null>("export_clips_with_picker", {
        clipIds: [...selectedIds],
      });
      if (count !== null) setNotice({ message: count + " clips exported" });
    });
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || modalOpen) return;
      const target = event.target as HTMLElement;
      const editing = target.matches('input,textarea,[contenteditable="true"]');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("clip-search")?.focus();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (selectedIds.size) setSelectedIds(new Set());
        else if (search) changeSearch("");
        else hide();
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "a" && !editing && target.closest(".clip-feed")) {
        event.preventDefault();setSelectedIds(new Set(clips.map(clip=>clip.id)));return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || editing || busy)
        return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!clips.length) return;
        const next = Math.max(
          0,
          Math.min(
            clips.length - 1,
            focusedIndex + (event.key === "ArrowDown" ? 1 : -1),
          ),
        );
        setFocusedIndex(next);
        virtualizer.scrollToIndex(next, { align: "auto" });
        return;
      }

      if (category === "trash") return;
      if (
        event.key === "Enter" &&
        !target.closest("button,a,select") &&
        clips[focusedIndex]
      ) {
        event.preventDefault();
        void copy(clips[focusedIndex]);
      }
      if (/^[1-9]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        if (clips[index]) {
          event.preventDefault();
          void copy(clips[index]);
        }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });
  return (
    <main className="app-shell">
      <SidebarHeader
        search={search}
        onSearchChange={changeSearch}
        isPinned={isPinned}
        onTogglePin={() =>
          void run(async () => {
            const next = !isPinned;
            await invoke("set_sidebar_pinned", { pinned: next });
            setIsPinned(next);
          })
        }
        onOpenHousekeeping={() => {
          setShowStorage(true);
          void refreshStats();
        }}
        onClose={hide}
      />
      {recoverableClip && !annotatingClip && <div className="notice"><span>Unfinished image edit</span><button className="text-button" onClick={()=>{setAnnotatingClip(recoverableClip);setRecoverableClip(null);}}>Resume draft</button></div>}
      <CategoryTabs
        activeCategory={category}
        onSelectCategory={chooseCategory}
        trashCount={stats?.trash_clips}
      />
      <div className="capture-row">
        <button
          className="text-button"
          disabled={busy || preferences?.capturePaused}
          onClick={() =>
            void run(async () => {
              await invoke("capture_screen");
            })
          }
        >
          <ScanLine size={16} />
          Screen snip
        </button>
        {preferences?.capturePaused ? (
          <span className="capture-paused">
            <Pause size={13} />
            Capture paused
          </span>
        ) : (
          <span>{preferences?.historyShortcut || "Ctrl+Shift+V"} to open</span>
        )}
      </div>
      <div className="feed-heading">
        <h2>{search ? "Search results" : labels[category]}</h2>
        <span>{isPinned ? "Pinned mode" : "Peek mode"}</span>
        <button
          className="icon-button compact"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh history"
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {notice && (
        <div
          className={"notice " + (notice.error ? "error" : "")}
          role={notice.error ? "alert" : "status"}
        >
          {notice.error ? <AlertCircle size={16} /> : <Check size={16} />}
          <span>{notice.message}</span>
          {notice.undoBatch && <button className="text-button" disabled={busy} onClick={()=>void run(async()=>{const count=await invoke<number>("undo_clip_batch",{token:notice.undoBatch});setNotice({message:count+" clips restored"});await refresh();})}>Undo</button>}
          {notice.undoIds && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void restore(notice.undoIds!)}
            >
              Undo
            </button>
          )}
          <button
            className="icon-button compact"
            aria-label="Dismiss message"
            onClick={() => setNotice(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {!!clips.length && <div className="selection-tools">
        <button className="text-button" disabled={busy} onClick={()=>setSelectedIds(new Set(clips.map(clip=>clip.id)))}>Select this page</button>
        {category !== "trash" && <><button className="text-button" disabled={busy} onClick={()=>void trash([],true)}>Select all matching…</button>
        <label><input type="checkbox" checked={includePinned} onChange={e=>setIncludePinned(e.target.checked)}/> Include pinned</label></>}
      </div>}
      <div
        className="clip-feed"
        ref={parentRef}
        tabIndex={0}
        aria-label="Clipboard history"
        aria-busy={loading}
      >
        {error ? (
          <div className="empty-state">
            <AlertCircle size={30} />
            <h3>History couldn’t load</h3>
            <p>{error}</p>
            <button className="button" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        ) : !clips.length ? (
          <div className="empty-state">
            {loading ? (
              <>
                <RefreshCw size={27} />
                <h3>Loading history…</h3>
              </>
            ) : (
              <>
                {search ? (
                  <Search size={32} />
                ) : category === "trash" ? (
                  <Trash2 size={32} />
                ) : (
                  <Clipboard size={32} />
                )}
                <h3>
                  {search
                    ? "No matching clips"
                    : category === "trash"
                      ? "Trash is empty"
                      : category === "pinned"
                        ? "Keep useful clips close"
                        : page > 0
                          ? "No more clips"
                          : "Your clipboard, kept here"}
                </h3>
                <p>
                  {search
                    ? "Try another word or clear your search."
                    : category === "trash"
                      ? "Clips you delete can be restored here for 30 days."
                      : category === "pinned"
                        ? "Pin a clip to find it quickly in this view."
                        : page > 0
                          ? "Return to the previous page to browse your history."
                          : "Copy text or an image in any app. It will appear here, ready to reuse."}
                </p>
                {search && (
                  <button className="button" onClick={() => changeSearch("")}>
                    Clear search
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const clip = clips[row.index];
              return (
                <div
                  key={row.key}
                  ref={virtualizer.measureElement}
                  data-index={row.index}
                  className="clip-row"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: "translateY(" + row.start + "px)",
                  }}
                >
                  <ClipCard
                    clip={clip}
                    isSelected={selectedIds.has(clip.id)}
                    isFocused={focusedIndex === row.index}
                    shortcutNumber={
                      category !== "trash" && row.index < 9
                        ? row.index + 1
                        : undefined
                    }
                    busy={busy}
                    onSelect={select}
                    onCopy={(clip) => void copy(clip)}
                    onTogglePin={(id) => void mutate("toggle_clip_pin", id)}
                    onTrash={(id) => void trash([id])}
                    onRestore={(id) => void restore([id])}
                    onPermanentDelete={setDeleteId}
                    onOpenAnnotator={setAnnotatingClip}
                    onNativeDrag={(id) =>
                      startDrag(selectedIds.has(id) ? [...selectedIds] : [id])
                    }
                    isTrashView={category === "trash"}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <MultiDropBar
        selectedCount={selectedIds.size}
        busy={busy}
        isTrash={category === "trash"}
        onClearSelection={() => setSelectedIds(new Set())}
        onExportSelected={() => void exportSelected()}
        onTrashSelected={() => void trash([...selectedIds])}
        onRestoreSelected={() => void restore([...selectedIds])}
        onNativeDrag={() => startDrag([...selectedIds])}
      />
      <footer className="history-footer">
        <span>
          {clips.length
            ? page * PAGE_SIZE + 1 + "–" + (page * PAGE_SIZE + clips.length)
            : "0"}{" "}
          clips
        </span>
        <div>
          <button
            className="icon-button compact"
            aria-label="Previous page"
            disabled={!page || loading}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <span>Page {page + 1}</span>
          <button
            className="icon-button compact"
            aria-label="Next page"
            disabled={!hasNext || loading}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </footer>
      {annotatingClip && (
        <AnnotatorModal
          clip={annotatingClip}
          onClose={() => { setAnnotatingClip(null); void readDraft().then(d=>setRecoverableClip(d?.clip || null)).catch(()=>{}); }}
          onSave={async (dataBase64, originalId) => {
            await invoke("save_annotated_image", { dataBase64, originalId });
            setNotice({ message: "Edited image saved to history" });
            void refresh().catch(report);
          }}
          onCopyResult={async (dataBase64) => {
            const ok = await invoke<boolean>("copy_image_base64_to_clipboard", {
              dataBase64,
            });
            if (!ok) throw new Error("Clipboard is busy. Try copying again.");
          }}
        />
      )}
      {showStorage && (
        <HousekeepingModal
          stats={stats}
          preferences={preferences}
          onPreferencesChange={async (value) => {
            setPreferences(
              await invoke<Preferences>("update_preferences", {
                preferences: value,
              }),
            );
          }}
          onClose={() => setShowStorage(false)}
          onEmptyTrash={async () => {
            await invoke("empty_trash");
            await refresh();
            setNotice({ message: "Trash emptied" });
          }}
        />
      )}
      {batch && <Dialog title={"Move "+batch.count+" clips to Trash?"} onClose={()=>setBatch(null)} busy={busy}>
        <div className="dialog-body"><p>This selection is fixed. New captures will not be deleted. You can restore these clips from Trash.</p>
        <div className="dialog-actions"><button className="button" disabled={busy} onClick={()=>setBatch(null)}>Cancel</button><button className="button destructive" disabled={busy} onClick={()=>void confirmBatch()}>Move to Trash</button></div></div>
      </Dialog>}
      {deleteId && (
        <Dialog
          title="Delete this clip?"
          onClose={() => setDeleteId(null)}
          busy={busy}
        >
          <div className="dialog-body">
            <p>
              This permanently deletes the clip from Trash. It cannot be undone.
            </p>
            <div className="dialog-actions">
              <button
                className="button"
                onClick={() => setDeleteId(null)}
                disabled={busy}
              >
                Keep clip
              </button>
              <button
                className="button destructive"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await invoke("delete_clip_permanently", { id: deleteId });
                    setDeleteId(null);
                    await refresh();
                  })
                }
              >
                Delete permanently
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </main>
  );
}
export default App;
