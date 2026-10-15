import "../extension/theme.js";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { CapturePad } from "./components/CapturePad";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Native identity is authoritative; the query is only for browser previews.
const isPad = isTauri()
  ? getCurrentWindow().label === "capture-pad"
  : new URLSearchParams(window.location.search).get("surface") === "pad";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      {isPad ? <CapturePad /> : <App />}
    </AppErrorBoundary>
  </React.StrictMode>,
);
