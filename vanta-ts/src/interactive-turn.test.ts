import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ReplState } from "./repl/types.js";

// BUG-TEMP-SCREENSHOT-GLUED-TEXT: a pasted macOS temp screenshot path followed by
// trailing text glued on with a plain space (not a newline, and not a space that
// precedes another absolute path) never isolates into its own line inside
// splitPastedImagePaths, so `imagePaths` comes back empty and the old code path
// skipped the clipboard-recovery fallback entirely — the whole blob (including a
// long-gone temp path) was silently treated as plain text. This locks the fix:
// resolveDroppedMedia checks looksLikeTempImagePath against the RAW text even when
// the splitter found zero paths.

const readClipboardImageMock = vi.fn();
vi.mock("./term/clipboard-image.js", () => ({
  readClipboardImage: (...args: unknown[]) => readClipboardImageMock(...args),
}));

describe("resolveDroppedMedia — temp screenshot path glued to trailing text", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    readClipboardImageMock.mockReset();
    Object.defineProperty(process, "platform", { value: "darwin" });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("recovers the clipboard image when the temp path is glued to the question by a space", async () => {
    const { resolveDroppedMedia } = await import("./interactive-turn.js");
    readClipboardImageMock.mockResolvedValue({ mime: "image/png", dataBase64: "AAAA" });

    const text =
      "/var/folders/rj/nj_9qs2s7zs52nsc90yl2q700000gn/T/TemporaryItems/" +
      "NSIRD_screencaptureui_d1Uf8L/Screenshot 2026-07-23 at 10.20.58 PM.png  " +
      "cant we make one like this from the deskto app";

    const state: ReplState = { sessionId: "s1", started: new Date(0).toISOString(), turnIndex: 0 };
    const { images } = await resolveDroppedMedia(text, state);

    expect(readClipboardImageMock).toHaveBeenCalledTimes(1);
    expect(images).toHaveLength(1);
    expect(images![0]!.dataBase64).toBe("AAAA");
  });

  it("falls through to plain text when there's no image on the clipboard either", async () => {
    const { resolveDroppedMedia } = await import("./interactive-turn.js");
    readClipboardImageMock.mockResolvedValue(null);

    const text = "/var/folders/x/T/TemporaryItems/Screenshot 1.png  ask me something";
    const state: ReplState = { sessionId: "s1", started: new Date(0).toISOString(), turnIndex: 0 };
    const { text: outText, images } = await resolveDroppedMedia(text, state);

    expect(images ?? []).toHaveLength(0);
    expect(outText).toBe(text);
  });
});
