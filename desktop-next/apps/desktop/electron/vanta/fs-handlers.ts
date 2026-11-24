import type { PreviewWatchOwner } from "../preview-file-watch";

import { CH } from "./channels";
import { gitRoot, readDir, readFileDataUrl, readFileText } from "./fs-read";
import { normalizePreviewTarget } from "./fs-preview";
import { createWatchRegistry, type WatchRegistry } from "./fs-watch";
import type { IpcLike } from "./native-handlers";
import type { ProjectGuard } from "./project-guard";

export interface FsDeps {
  guard: ProjectGuard;
  ipc: IpcLike;
  /** Test seam: replaces the real fs.watch registry. */
  watches?: WatchRegistry;
}

const owner = (event: { sender: unknown }): PreviewWatchOwner => event.sender as PreviewWatchOwner;

/**
 * Read-only file access for the Files pane and previews. Every path is resolved by the project guard, so a
 * request outside the project, through a symlink, or at a secret file gets a structured refusal and no bytes.
 */
export function registerFsHandlers(deps: FsDeps): WatchRegistry {
  const { guard, ipc } = deps;
  const watches = deps.watches ?? createWatchRegistry({ guard });

  ipc.handle(CH.fsReadDir, (_event, raw: unknown, page: unknown) => readDir(guard, raw, page));
  ipc.handle(CH.fsGitRoot, (_event, raw: unknown) => gitRoot(guard, raw));
  ipc.handle(CH.fsReadText, (_event, raw: unknown) => readFileText(guard, raw));
  ipc.handle(CH.fsReadDataUrl, (_event, raw: unknown) => readFileDataUrl(guard, raw));
  ipc.handle(CH.fsNormalizePreview, (_event, target: unknown, base: unknown) => normalizePreviewTarget(guard, target, base));

  ipc.handle(CH.fsWatchFile, (event, raw: unknown) => watches.watchFile(owner(event), raw));

  // The directory watch contract has no structured-failure shape, so a refusal rejects with the reason.
  ipc.handle(CH.fsWatchDirectory, async (event, raw: unknown) => {
    const watching = await watches.watchDirectory(owner(event), raw);

    if ("ok" in watching) {
      throw new Error(watching.message);
    }

    return watching;
  });

  ipc.handle(CH.fsStopWatch, (_event, id: unknown) => (typeof id === "string" ? watches.stop(id) : false));

  return watches;
}
