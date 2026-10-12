import type { Clip, ClipFilter } from "../types/clip";
export const PAGE_SIZE = 100;
export type HistoryCategory =
  "all" | "image" | "text" | "code" | "link" | "pinned" | "trash";
export interface HistorySnapshot {
  clips: Clip[];
  loading: boolean;
  error: string | null;
  hasNext: boolean;
}
/** One bounded page; only the newest request may publish results. */
export class HistoryController {
  snapshot: HistorySnapshot = {
    clips: [],
    loading: false,
    error: null,
    hasNext: false,
  };
  private revision = 0;
  private listeners = new Set<() => void>();
  private query: (filter: ClipFilter) => Promise<Clip[]>;
  constructor(query: (filter: ClipFilter) => Promise<Clip[]>) {
    this.query = query;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private publish(snapshot: HistorySnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
  invalidate() {
    this.revision++;
  }
  async load(
    category: HistoryCategory,
    search: string,
    page: number,
    refresh = false,
  ) {
    const revision = ++this.revision;
    this.publish({
      ...this.snapshot,
      clips: refresh ? this.snapshot.clips : [],
      loading: true,
      error: null,
    });
    const filter: ClipFilter = {
      search: search.trim() || undefined,
      clip_type: ["image", "text", "code", "link"].includes(category)
        ? category
        : undefined,
      pinned_only: category === "pinned",
      trash_only: category === "trash",
      limit: PAGE_SIZE + 1,
      offset: Math.max(0, page) * PAGE_SIZE,
    };
    try {
      const clips = await this.query(filter);
      if (revision !== this.revision) return;
      this.publish({
        clips: clips.slice(0, PAGE_SIZE),
        hasNext: clips.length > PAGE_SIZE,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (revision !== this.revision) return;
      this.publish({
        clips: [],
        loading: false,
        hasNext: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
