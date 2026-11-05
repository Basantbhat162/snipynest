import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect, useRef } from "react";
import { HardDrive, Trash2 } from "lucide-react";
import type { StorageStats, Preferences } from "../types/clip";
import { formatBytes } from "../lib/format";
import { Dialog } from "./Dialog";
import { ThemeChoice } from "./ThemeChoice";
import { KeyboardSettings } from "./KeyboardSettings";
export function HousekeepingModal({
  stats,
  preferences,
  onPreferencesChange,
  onClose,
  onEmptyTrash,
}: {
  stats: StorageStats | null;
  preferences: Preferences | null;
  onPreferencesChange: (value: Preferences) => Promise<void>;
  onClose: () => void;
  onEmptyTrash: () => Promise<void>;
}) {
  const [draft, updateDraft] = useState<Preferences | null>(preferences);
  const dirty=useRef(false);
  const setDraft=(value:Preferences)=>{dirty.current=true;updateDraft(value);};
  useEffect(() => {
    if (preferences) updateDraft(current=>dirty.current && current ? {...current,singleKeyEnabled:preferences.singleKeyEnabled===false?false:current.singleKeyEnabled} : preferences);
  }, [preferences]);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [keyboardBusy,setKeyboardBusy]=useState(false);
  const [error, setError] = useState("");
  async function empty() {
    setBusy(true);
    setError("");
    try {
      await onEmptyTrash();
      setConfirm(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Settings & storage" onClose={onClose} busy={busy}>
      <div className="dialog-body settings-body">
        <ThemeChoice />
        {draft && (
          <form
            onChange={() => setSaved(false)}
            className="preferences"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              setSaved(false);
              void onPreferencesChange(draft)
                .then(() => {dirty.current=false;setSaved(true);})
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            <fieldset className="settings-section" disabled={busy}>
              <legend>Clipboard &amp; startup</legend>
            <label className="preference-toggle">
              <span>
                Pause clipboard capture
                <small>New copies will not be saved.</small>
              </span>
              <input
                type="checkbox"
                checked={draft.capturePaused}
                onChange={(e) => {
                  setDraft({ ...draft, capturePaused: e.target.checked });
                  setSaved(false);
                }}
              />
            </label>
            <label className="preference-toggle">
              <span>
                Start at Windows sign-in
                <small>Open quietly in the system tray.</small>
              </span>
              <input
                type="checkbox"
                checked={draft.startAtLogin}
                onChange={(e) => {
                  setDraft({ ...draft, startAtLogin: e.target.checked });
                  setSaved(false);
                }}
              />
            </label>
            <label className="preference-toggle">
              <span>
                Keep deleted clips
                <small>Days in Trash; applies at next startup.</small>
              </span>
              <input
                aria-label="Trash retention days"
                type="number"
                min="1"
                max="365"
                required
                value={draft.trashRetentionDays}
                onChange={(e) => {
                  setDraft({
                    ...draft,
                    trashRetentionDays: Number(e.target.value),
                  });
                  setSaved(false);
                }}
              />
            </label>
            </fieldset>
            <fieldset className="settings-section" disabled={busy}>
              <legend>Capture Pad</legend>
              <p className="settings-description">A small shelf for your latest image. Choose when it appears and what it shows.</p>
            <label className="preference-toggle"><span>Capture Pad<small>Quiet access to new images; click to open history.</small></span><select value={draft.padMode ?? "arrival"} onChange={e => setDraft({...draft, padMode: e.target.value as Preferences["padMode"]})}><option value="arrival">On new images</option><option value="always">Always visible</option><option value="off">Off</option></select></label>
            <label className="preference-toggle"><span>Hide Pad after<small>The timer pauses while you use the Pad.</small></span><select value={draft.padHideSeconds ?? 8} onChange={e=>{setDraft({...draft,padHideSeconds:Number(e.target.value)});setSaved(false);}}>{[3,5,8,15,30,0].map(seconds=><option key={seconds} value={seconds}>{seconds ? seconds+" seconds" : "Never"}</option>)}</select></label>
            <label className="preference-toggle"><span>Show Pad when closing history</span><input type="checkbox" checked={draft.padOnHistoryClose ?? true} onChange={e=>{setDraft({...draft,padOnHistoryClose:e.target.checked});setSaved(false);}}/></label>
            <label className="preference-toggle"><span>Hide thumbnail previews</span><input type="checkbox" checked={draft.padPrivacy ?? false} onChange={e => setDraft({...draft,padPrivacy:e.target.checked})}/></label>
            <button type="button" className="button" onClick={() => void invoke("reset_capture_pad").catch(e => setError(String(e)))}>Show / reset Capture Pad</button>
            </fieldset>
            <fieldset className="settings-section" disabled={busy}>
              <legend>Sound &amp; interaction</legend>
            <label className="preference-toggle"><span>Capture sound<small>Play the SnipyNest sound when a new image is saved.</small></span><input type="checkbox" checked={draft.captureSound ?? true} onChange={e => { setDraft({...draft,captureSound:e.target.checked}); setSaved(false); }}/></label>
            <label className="preference-toggle"><span>Hide during drag<small>Otherwise the sidebar becomes translucent.</small></span><input type="checkbox" checked={draft.hideDuringDrag ?? false} onChange={e => setDraft({...draft,hideDuringDrag:e.target.checked})}/></label>
            <label className="preference-toggle"><span>Sound volume: {draft.soundVolume ?? 70}%</span><input aria-label="Capture sound volume" type="range" min="0" max="100" step="5" value={draft.soundVolume ?? 70} onChange={e=>setDraft({...draft,soundVolume:Number(e.target.value)})}/></label>
            <button type="button" className="button" onClick={() => void invoke("preview_capture_sound", {volume:draft.soundVolume ?? 70}).catch(e => setError(String(e)))}>Play sound sample</button>
            </fieldset>
            <fieldset className="settings-section" disabled={busy}>
              <legend>Global shortcuts</legend>
              <p className="settings-description">These shortcuts work while SnipyNest is running in the tray.</p>
            <label className="preference-toggle"><span>Screen snip shortcut</span><input aria-label="Screen snip shortcut" value={draft.snipShortcut ?? "Ctrl+Shift+S"} onChange={e=>setDraft({...draft,snipShortcut:e.target.value})}/></label>
            <label className="preference-toggle"><span>Quick monitor capture<small>Copies the monitor under your pointer.</small></span><input aria-label="Quick monitor capture shortcut" value={draft.quickCaptureShortcut ?? "Ctrl+Alt+S"} onChange={e=>setDraft({...draft,quickCaptureShortcut:e.target.value})}/></label>
            <label className="preference-toggle"><span>Exclude taskbar<small>Quick snapshots use the monitor’s usable work area.</small></span><input type="checkbox" checked={draft.excludeTaskbar??true} onChange={e=>setDraft({...draft,excludeTaskbar:e.target.checked})}/></label>
            <label className="preference-toggle"><span>History shortcut</span><input aria-label="History shortcut" value={draft.historyShortcut ?? "Ctrl+Shift+V"} onChange={e=>setDraft({...draft,historyShortcut:e.target.value})}/></label>
            <button type="button" className="text-button" onClick={()=>{setDraft({...draft,snipShortcut:"Ctrl+Shift+S",historyShortcut:"Ctrl+Shift+V",quickCaptureShortcut:"Ctrl+Alt+S"});setSaved(false);}}>Reset shortcuts</button>
            </fieldset>
            <KeyboardSettings draft={draft} onChange={value=>{setDraft(value);setSaved(false);}} busy={busy} onBusyChange={setKeyboardBusy}/>
            <div className="preferences-save">
              <span role="status">{saved ? "Settings saved" : ""}</span>
              <button className="button primary" type="submit" disabled={busy||keyboardBusy}>
                {busy ? "Saving…" : "Save settings"}
              </button>
            </div>
          </form>
        )}
        <h3>
          <HardDrive size={17} />
          Your clipboard
        </h3>
        {stats ? (
          <dl className="storage-list">
            <div>
              <dt>Saved clips</dt>
              <dd>{stats.total_clips.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Images</dt>
              <dd>{stats.image_clips.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Pinned clips</dt>
              <dd>{stats.pinned_clips.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Content size</dt>
              <dd>{formatBytes(stats.total_bytes)}</dd>
            </div>
            <div>
              <dt>Trash</dt>
              <dd>{stats.trash_clips.toLocaleString()}</dd>
            </div>
          </dl>
        ) : (
          <p role="status">Loading storage information…</p>
        )}
        <p className="muted">
          History is stored on this computer. Deleted clips stay in Trash for{" "}
          {preferences?.trashRetentionDays ?? 30} days before cleanup at
          startup.
        </p>
        <h3>Keyboard shortcuts</h3><p className="muted">Your registered snip shortcut is {preferences?.snipShortcut ?? "Ctrl+Shift+S"}.</p>
        <dl className="shortcut-list">
          <div>
            <dt>Show or hide</dt>
            <dd>
              <kbd>{preferences?.historyShortcut ?? "Ctrl+Shift+V"}</kbd>
            </dd>
          </div>
          <div>
            <dt>Search history</dt>
            <dd>
              <kbd>Ctrl K</kbd>
            </dd>
          </div>
          <div>
            <dt>Navigate clips</dt>
            <dd>
              <kbd>↑ ↓</kbd>
            </dd>
          </div>
          <div>
            <dt>Copy focused clip</dt>
            <dd>
              <kbd>Enter</kbd>
            </dd>
          </div>
          <div>
            <dt>Copy first nine</dt>
            <dd>
              <kbd>1–9</kbd>
            </dd>
          </div>
        </dl>
        <h3>Browser companion</h3>
        <p className="muted">
          Use the SnipyNest Companion in Brave, Chrome or Edge to capture a page.
          Keep SnipyNest running; the captured image arrives through your
          clipboard.
        </p>
        {!!stats?.trash_clips && (
          <div className="trash-action">
            {confirm ? (
              <>
                <p>
                  Delete all {stats.trash_clips} clips in Trash permanently?
                  This cannot be undone.
                </p>
                <div className="dialog-actions">
                  <button
                    className="button"
                    onClick={() => setConfirm(false)}
                    disabled={busy}
                  >
                    Keep clips
                  </button>
                  <button
                    className="button destructive"
                    onClick={() => void empty()}
                    disabled={busy}
                  >
                    {busy ? "Deleting…" : "Delete permanently"}
                  </button>
                </div>
              </>
            ) : (
              <button className="button" onClick={() => setConfirm(true)}>
                <Trash2 size={16} />
                Empty Trash
              </button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
