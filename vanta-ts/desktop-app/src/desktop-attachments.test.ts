import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizedAttachmentItems, pickDesktopAttachments, resolveDesktopDroppedFiles } from "./desktop-attachments.js";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("desktop attachment bridge", () => {
  it("resolves native dropped files through the preload bridge", async () => {
    const file = new File(["hello"], "hello.txt");
    const resolveDroppedFiles = vi.fn(async () => ({ files: ["hello.txt"], errors: [] }));
    vi.stubGlobal("window", { vantaDesktop: { resolveDroppedFiles } });

    await expect(resolveDesktopDroppedFiles([file])).resolves.toEqual({ files: ["hello.txt"], errors: [] });
    expect(resolveDroppedFiles).toHaveBeenCalledWith([file]);
  });

  it("opens the native file and folder picker through the preload bridge", async () => {
    const pickAttachments = vi.fn(async () => ({ files: ["docs/guide.md"], errors: [] }));
    vi.stubGlobal("window", { vantaDesktop: { pickAttachments } });

    await expect(pickDesktopAttachments()).resolves.toEqual({ files: ["docs/guide.md"], errors: [] });
    expect(pickAttachments).toHaveBeenCalledOnce();
  });

  it("normalizes legacy files into individual display items", () => {
    expect(normalizedAttachmentItems({ files: ["docs/guide.md"], errors: [] })).toEqual([{
      id: "file:docs/guide.md",
      kind: "file",
      path: "docs/guide.md",
      label: "guide.md",
      files: ["docs/guide.md"],
    }]);
  });
});
