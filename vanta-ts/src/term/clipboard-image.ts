import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ImageAttachment } from "../types.js";

// Read a PNG image off the macOS clipboard into an ImageAttachment. This is the
// reusable core of the `/paste` slash command — extracted so the composer can
// route a paste keystroke straight into the vision flow. The osascript dance is
// the only way to pull binary image data off the pasteboard; it degrades to null
// off-macOS or when the clipboard holds no image (never throws).

/** Side effects the reader needs, injected so the osascript path is unit-testable. */
export type ClipboardImageDeps = {
  runOsascript: (script: string) => Promise<void>;
  readFile: (path: string) => Promise<Buffer>;
  removeFile: (path: string) => Promise<void>;
  tmpPath: () => string;
  platform?: string;
};

/** AppleScript that writes the clipboard's PNG representation to `tmp`. Pure. */
export function pngClipboardScript(tmp: string): string {
  return `set f to (open for access (POSIX file "${tmp}") with write permission)\ntry\nwrite (the clipboard as «class PNGf») to f\nend try\nclose access f`;
}

/** Default deps: real osascript + fs, a unique temp path per call. */
function defaultDeps(): ClipboardImageDeps {
  return {
    runOsascript: async (script) => {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      await promisify(execFile)("osascript", ["-e", script]);
    },
    readFile: async (path) => {
      const { readFile } = await import("node:fs/promises");
      return readFile(path);
    },
    removeFile: async (path) => {
      const { rm } = await import("node:fs/promises");
      await rm(path, { force: true }).catch(() => {});
    },
    tmpPath: () => join(tmpdir(), `vanta-paste-${Date.now()}.png`),
    platform: process.platform,
  };
}

/**
 * Pull a PNG off the clipboard as a base64 ImageAttachment, or null when there's
 * no image / not macOS / anything fails. Mirrors the `/paste` handler's behavior.
 */
export async function readClipboardImage(deps: ClipboardImageDeps = defaultDeps()): Promise<ImageAttachment | null> {
  if ((deps.platform ?? process.platform) !== "darwin") return null;
  const tmp = deps.tmpPath();
  try {
    await deps.runOsascript(pngClipboardScript(tmp));
    const buf = await deps.readFile(tmp).catch(() => Buffer.alloc(0));
    await deps.removeFile(tmp);
    if (!buf.length) return null;
    return { mime: "image/png", dataBase64: buf.toString("base64") };
  } catch {
    await deps.removeFile(tmp).catch(() => {});
    return null;
  }
}
