import { EventEmitter } from "node:events";

// VANTA-AGENT-SUMMARY — in-process registry of running sub-agents and their
// latest one-line progress summary. spawnSubagent writes here; the TUI footer
// hook subscribes. Process-local and best-effort: it never persists and never
// throws into the run. A worker with no summary yet still shows (title only).

export type SubagentProgress = {
  id: string;
  /** Short label for the worker (its goal, clipped) — shown if no summary yet. */
  title: string;
  /** Latest 3–5 word present-tense summary, or null before the first update. */
  summary: string | null;
  /** Epoch ms of the last summary write, or null before the first update. */
  updatedAt: number | null;
};

const CHANGE = "change";

class ProgressStore extends EventEmitter {
  private readonly byId = new Map<string, SubagentProgress>();

  register(id: string, title: string): void {
    if (this.byId.has(id)) return;
    this.byId.set(id, { id, title, summary: null, updatedAt: null });
    this.emit(CHANGE);
  }

  setSummary(id: string, summary: string, at: number): void {
    const cur = this.byId.get(id);
    if (!cur) return;
    this.byId.set(id, { ...cur, summary, updatedAt: at });
    this.emit(CHANGE);
  }

  clear(id: string): void {
    if (this.byId.delete(id)) this.emit(CHANGE);
  }

  /** Snapshot of all running sub-agents, newest-updated first. */
  snapshot(): SubagentProgress[] {
    return [...this.byId.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }

  subscribe(listener: () => void): () => void {
    this.on(CHANGE, listener);
    return () => this.off(CHANGE, listener);
  }
}

let singleton: ProgressStore | null = null;

/** The shared store. Lazily created so importing this module is side-effect-free. */
export function progressStore(): ProgressStore {
  return (singleton ??= new ProgressStore());
}
