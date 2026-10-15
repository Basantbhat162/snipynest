// Shared by desktop windows and extension pages; never touches clipboard data.
const key = "snipynest.theme";
const listeners = new Set();
let theme = "light";
try { theme = localStorage.getItem(key) === "dark" ? "dark" : "light"; } catch {}
export function getTheme() { return theme; }
function apply(value) {
  theme = value === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll("[data-theme-choice]").forEach(control => { control.value = theme; });
  listeners.forEach(listener => listener());
}
export function setTheme(value) {
  if (value !== "light" && value !== "dark") return;
  // Apply only after persistence succeeds so the control never claims a saved choice.
  localStorage.setItem(key, value);
  apply(value);
}
export function subscribeTheme(listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
apply(theme);
window.addEventListener("storage", event => {
  if (event.key === key || event.key === null) {
    try { if (event.storageArea && event.storageArea !== localStorage) return; } catch {}
    apply(event.newValue);
  }
});
function bindControls() {
  document.querySelectorAll("[data-theme-choice]").forEach(control => {
    control.value = theme;
    control.addEventListener("change", () => {
      const status = document.getElementById("theme-status");
      try { setTheme(control.value); if (status) status.textContent = ""; }
      catch { control.value = theme; if (status) status.textContent = "Could not save theme. Please try again."; }
    });
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindControls, { once: true });
else bindControls();
