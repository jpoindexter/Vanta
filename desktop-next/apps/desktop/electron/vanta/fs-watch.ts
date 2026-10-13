import { randomBytes } from "node:crypto";
import { type FSWatcher, watch as fsWatch } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { type PreviewWatchOwner, sendPreviewFileChangedToOwner } from "../preview-file-watch";

import { readFailure, type ReadFileErrorResult } from "./fs-read";
import { watchTargetPath } from "./fs-preview";
import type { ProjectGuard } from "./project-guard";

export const WATCH_DEBOUNCE_MS = 120;
export const MAX_WATCHES_PER_WINDOW = 64;

type WatchFn = (dir: string, listener: (event: string, filename: null | string) => void) => Pick<FSWatcher, "close">;

export interface WatchDeps {
  debounceMs?: number;
  guard: ProjectGuard;
  watch?: WatchFn;
}

export interface WatchHandle {
  id: string;
  path: string;
}

interface Entry {
  close: () => void;
  owner: unknown;
}

const watchFailure = (message: string, target: unknown): ReadFileErrorResult => ({
  error: "EMFILE",
  message,
  ok: false,
  ...(typeof target === "string" ? { path: target } : {})
});

/**
 * Watches a folder, or one file inside it, for change ticks. Both are confined to the project by the guard,
 * debounced, capped per window and closed the moment the window that asked for them goes away.
 */
export class WatchRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly hooked = new WeakSet<object>();
  private readonly debounceMs: number;
  private readonly guard: ProjectGuard;
  private readonly watch: WatchFn;

  constructor({ debounceMs = WATCH_DEBOUNCE_MS, guard, watch = fsWatch as WatchFn }: WatchDeps) {
    this.debounceMs = debounceMs;
    this.guard = guard;
    this.watch = watch;
  }

  size = (): number => this.entries.size;

  stop = (id: string): boolean => {
    this.entries.get(id)?.close();

    return this.entries.delete(id);
  };

  closeAll = (): void => [...this.entries.keys()].forEach(this.stop);

  watchDirectory = async (owner: PreviewWatchOwner, raw: unknown): Promise<ReadFileErrorResult | WatchHandle> => {
    const target = await this.guard.resolve(typeof raw === "string" ? raw : "", "dir");

    if (target.ok === false) {
      return readFailure(target.error, raw);
    }

    return this.countFor(owner) >= MAX_WATCHES_PER_WINDOW
      ? watchFailure("Too many folders are being watched. Close a preview and try again.", raw)
      : this.start(owner, { dir: target.value.real, only: null, shown: target.value.abs });
  };

  watchFile = async (owner: PreviewWatchOwner, raw: unknown): Promise<ReadFileErrorResult | WatchHandle> => {
    const target = await this.guard.resolve(watchTargetPath(raw), "file");

    if (target.ok === false) {
      return readFailure(target.error, raw);
    }

    return this.countFor(owner) >= MAX_WATCHES_PER_WINDOW
      ? watchFailure("Too many files are being watched. Close a preview and try again.", raw)
      : this.start(owner, {
          dir: path.dirname(target.value.real),
          only: path.basename(target.value.real),
          shown: target.value.abs
        });
  };

  private countFor(owner: unknown): number {
    return [...this.entries.values()].filter(entry => entry.owner === owner).length;
  }

  private closeFor(owner: unknown): void {
    for (const [id, entry] of this.entries) {
      if (entry.owner === owner) {
        this.stop(id);
      }
    }
  }

  // One listener per window, however many watches it holds: an EventEmitter warns past ten.
  private hook(owner: PreviewWatchOwner): void {
    if (!this.hooked.has(owner)) {
      this.hooked.add(owner);
      owner.once("destroyed", () => this.closeFor(owner));
    }
  }

  private start(owner: PreviewWatchOwner, spec: { dir: string; only: null | string; shown: string }): WatchHandle {
    const id = randomBytes(12).toString("base64url");
    let timer: null | ReturnType<typeof setTimeout> = null;

    const emit = () => {
      timer = null;
      sendPreviewFileChangedToOwner(
        owner,
        { id, path: spec.shown, url: pathToFileURL(spec.shown).toString() },
        () => this.stop(id)
      );
    };

    const watcher = this.watch(spec.dir, (_event, filename) => {
      if (spec.only && filename && path.basename(String(filename)) !== spec.only) {
        return;
      }

      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(emit, this.debounceMs);
    });

    this.hook(owner);
    this.entries.set(id, {
      close: () => {
        if (timer) {
          clearTimeout(timer);
        }

        watcher.close();
      },
      owner
    });

    return { id, path: spec.shown };
  }
}

export const createWatchRegistry = (deps: WatchDeps): WatchRegistry => new WatchRegistry(deps);
