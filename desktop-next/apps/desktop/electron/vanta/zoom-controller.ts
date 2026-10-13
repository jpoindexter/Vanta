import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  applyZoomLevel,
  clampZoomLevel,
  DEFAULT_ZOOM_LEVEL,
  installZoomReassertOnNavigation,
  installZoomReassertOnWindowEvents,
  percentToZoomLevel,
  ZOOM_STEP
} from "../zoom";

const stateSchema = z.object({ level: z.number().finite() });
const percentSchema = z.number().finite().min(1).max(10_000);

export interface ZoomStore {
  read: () => null | number;
  write: (level: number) => void;
}

/** The persisted zoom level lives in the app's own data folder, not in the page, so a cleared cache does not lose it. */
export function createJsonZoomStore(file: string): ZoomStore {
  return {
    read: () => {
      try {
        const parsed = stateSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));

        return parsed.success ? clampZoomLevel(parsed.data.level) : null;
      } catch {
        return null;
      }
    },
    write: level => {
      try {
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify({ level }), "utf8");
      } catch {
        // A zoom that cannot be saved still applies for this session.
      }
    }
  };
}

interface ZoomTarget {
  isDestroyed: () => boolean;
  webContents: Parameters<typeof applyZoomLevel>[0] & { getZoomLevel: () => number };
}

export function createZoomController(store: ZoomStore, getWindow: () => null | ZoomTarget) {
  const set = (level: number): void => {
    const window = getWindow();

    if (window && !window.isDestroyed()) {
      store.write(applyZoomLevel(window.webContents, level));
    }
  };

  const current = (): number => {
    const window = getWindow();

    return window && !window.isDestroyed() ? window.webContents.getZoomLevel() : DEFAULT_ZOOM_LEVEL;
  };

  return {
    in: () => set(current() + ZOOM_STEP),
    out: () => set(current() - ZOOM_STEP),
    /** A percent from the renderer; anything that is not a sane number is ignored. */
    persistPercent: (percent: unknown) => {
      const parsed = percentSchema.safeParse(percent);

      if (parsed.success) {
        set(percentToZoomLevel(parsed.data));
      }
    },
    reset: () => set(DEFAULT_ZOOM_LEVEL),
    /** Re-apply the saved level, unless the window already shows it. */
    restore: () => {
      const window = getWindow();
      const saved = store.read();

      if (!window || window.isDestroyed() || saved === null) {
        return;
      }

      if (Math.abs(window.webContents.getZoomLevel() - saved) > 1e-9) {
        applyZoomLevel(window.webContents, saved);
      }
    }
  };
}

export type ZoomController = ReturnType<typeof createZoomController>;

/** Chromium drops zoom on resize, display change and in-page navigation, so the saved level is re-applied. */
export function keepZoomApplied(window: Parameters<typeof installZoomReassertOnWindowEvents>[0], zoom: ZoomController): void {
  installZoomReassertOnWindowEvents(window, zoom.restore);
  installZoomReassertOnNavigation(window.webContents, zoom.restore);
}
