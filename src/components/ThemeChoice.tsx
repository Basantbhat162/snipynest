import { useState, useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme, type Theme } from "../../extension/theme.js";

export function ThemeChoice() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme);
  const [error, setError] = useState("");
  return <section className="settings-section" aria-label="Appearance">
    <h3>Appearance</h3>
    <label className="preference-toggle">
      <span>Theme<small>Applies immediately to history, the editor and Capture Pad.</small></span>
      <select aria-label="Theme" value={theme} onChange={event => {
        try { setTheme(event.target.value as Theme); setError(""); }
        catch { setError("Could not save theme. Please try again."); }
      }}>
        <option value="light">Light</option><option value="dark">Dark</option>
      </select>
    </label>
    {error && <p role="alert" className="error-text">{error}</p>}
  </section>;
}
