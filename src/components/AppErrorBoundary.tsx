import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

/** Recover the view without touching persistent clipboard history. */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SnipyNest view failed", error, info.componentStack);
  }
  render() {
    if (this.state.failed)
      return (
        <main className="app-shell">
          <div className="empty-state" role="alert">
            <h1>The workspace couldn’t display</h1>
            <p>
              Your saved history is still on this computer. Reload the view to
              continue.
            </p>
            <button className="button" onClick={() => window.location.reload()}>
              Reload workspace
            </button>
          </div>
        </main>
      );
    return this.props.children;
  }
}
