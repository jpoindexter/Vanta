import { describe, it, expect, vi } from "vitest";
import { readClipboardImage, pngClipboardScript, type ClipboardImageDeps } from "./clipboard-image.js";

function deps(over: Partial<ClipboardImageDeps>): ClipboardImageDeps {
  return {
    runOsascript: vi.fn(async () => {}),
    readFile: vi.fn(async () => Buffer.from("PNGDATA")),
    removeFile: vi.fn(async () => {}),
    tmpPath: () => "/tmp/vanta-paste-1.png",
    platform: "darwin",
    ...over,
  };
}

describe("pngClipboardScript", () => {
  it("targets the given temp path and reads PNGf", () => {
    const s = pngClipboardScript("/tmp/x.png");
    expect(s).toContain('POSIX file "/tmp/x.png"');
    expect(s).toContain("«class PNGf»");
  });
});

describe("readClipboardImage", () => {
  it("returns a base64 png attachment when the clipboard has an image", async () => {
    const d = deps({});
    const img = await readClipboardImage(d);
    expect(img).toEqual({ mime: "image/png", dataBase64: Buffer.from("PNGDATA").toString("base64") });
    expect(d.runOsascript).toHaveBeenCalledWith(pngClipboardScript("/tmp/vanta-paste-1.png"));
    expect(d.removeFile).toHaveBeenCalledWith("/tmp/vanta-paste-1.png"); // temp cleaned up
  });

  it("returns null off macOS without touching the clipboard", async () => {
    const run = vi.fn(async () => {});
    const img = await readClipboardImage(deps({ platform: "linux", runOsascript: run }));
    expect(img).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("returns null when the clipboard holds no image (empty buffer)", async () => {
    const img = await readClipboardImage(deps({ readFile: async () => Buffer.alloc(0) }));
    expect(img).toBeNull();
  });

  it("returns null and cleans up when osascript throws", async () => {
    const removeFile = vi.fn(async () => {});
    const img = await readClipboardImage(deps({
      runOsascript: async () => { throw new Error("osascript missing"); },
      removeFile,
    }));
    expect(img).toBeNull();
    expect(removeFile).toHaveBeenCalled();
  });
});
