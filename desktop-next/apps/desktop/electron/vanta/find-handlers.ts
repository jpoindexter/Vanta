import type { BrowserWindow } from "electron";
import { z } from "zod";

import {
  installFindShortcut,
  installFoundInPageForwarder,
  performFindAfterIndexingStarted,
  stopFind
} from "../find-in-page";

import { CH } from "./channels";
import type { IpcLike } from "./native-handlers";

const MAX_QUERY_LENGTH = 500;

const findOptions = z.object({ findNext: z.boolean().optional(), forward: z.boolean().optional() }).strict();

export interface FindDeps {
  getWindow: (sender: unknown) => BrowserWindow | null;
  ipc: IpcLike;
}

interface FindSender {
  id: number;
  once: (event: "destroyed", listener: () => void) => unknown;
}

/**
 * Find in page for the window that asked. The query only ever reaches `webContents.findInPage`, which searches
 * the page text; it reads no file and runs nothing. Match counts come back through `found-in-page`.
 */
export function registerFindHandlers(deps: FindDeps): void {
  const forwarders = new Map<number, () => void>();

  const ensureForwarder = (sender: FindSender & Parameters<typeof installFoundInPageForwarder>[0]) => {
    if (!forwarders.has(sender.id)) {
      forwarders.set(sender.id, installFoundInPageForwarder(sender));
      sender.once("destroyed", () => {
        forwarders.get(sender.id)?.();
        forwarders.delete(sender.id);
      });
    }
  };

  deps.ipc.handle(CH.findInPage, async (event, query: unknown, options: unknown) => {
    const window = deps.getWindow(event.sender);
    const parsed = findOptions.safeParse(options ?? {});

    if (!window || window.isDestroyed() || typeof query !== "string" || query.length > MAX_QUERY_LENGTH) {
      return { count: 0 };
    }

    ensureForwarder(event.sender as never);
    await performFindAfterIndexingStarted(window.webContents, query, parsed.success ? parsed.data : {});

    return { count: 0 };
  });

  deps.ipc.handle(CH.stopFindInPage, event => {
    const window = deps.getWindow(event.sender);

    if (window && !window.isDestroyed()) {
      stopFind(window.webContents);
    }
  });
}

/** Linux only: some desktops swallow Ctrl+F before the page sees it. macOS and Windows use the renderer's own keybind. */
export function installLinuxFindShortcut(window: BrowserWindow, platform: NodeJS.Platform = process.platform): void {
  if (platform === "linux") {
    installFindShortcut(window);
  }
}
