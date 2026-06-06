import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeImageTool, mimeForImage } from "./describe-image.js";
import type { ToolContext } from "./types.js";

// requestApproval throws if invoked — describe_image never asks for approval,
// so any call indicates a logic error.
const makeCtx = (root: string): ToolContext => ({
  root,
  safety: {} as ToolContext["safety"],
  requestApproval: async () => {
    throw new Error("requestApproval must not be called in these tests");
  },
});

describe("describeImageTool", () => {
  it("returns ok:false when path is missing", async () => {
    const res = await describeImageTool.execute({}, makeCtx("/tmp/vanta-scope"));
    expect(res.ok).toBe(false);
  });

  it("returns ok:false when path is not a string", async () => {
    const res = await describeImageTool.execute(
      { path: 123 },
      makeCtx("/tmp/vanta-scope"),
    );
    expect(res.ok).toBe(false);
  });

  it("returns ok:false for a path outside project scope", async () => {
    const res = await describeImageTool.execute(
      { path: "../escape.png" },
      makeCtx("/tmp/vanta-scope"),
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("outside project scope");
  });

  describe("with a real in-scope image and no API key", () => {
    let dir: string;
    const savedKey = process.env.OPENAI_API_KEY;
    const savedProvider = process.env.VANTA_PROVIDER;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "vanta-img-"));
      // 1x1 transparent PNG — real bytes so readFile + base64 succeed.
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
        "base64",
      );
      await writeFile(join(dir, "pixel.png"), png);
    });

    afterEach(async () => {
      if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = savedKey;
      if (savedProvider === undefined) delete process.env.VANTA_PROVIDER;
      else process.env.VANTA_PROVIDER = savedProvider;
      await rm(dir, { recursive: true, force: true });
    });

    it("returns a clear ok:false when the active provider has no key (no API call)", async () => {
      process.env.VANTA_PROVIDER = "openai"; // deterministic; no real network
      process.env.OPENAI_API_KEY = "";
      const res = await describeImageTool.execute(
        { path: "pixel.png" },
        makeCtx(dir),
      );
      expect(res.ok).toBe(false);
      expect(res.output).toMatch(/OPENAI_API_KEY|could not describe/);
    });

    it("rejects an unsupported image extension before any API call", async () => {
      process.env.VANTA_PROVIDER = "openai";
      process.env.OPENAI_API_KEY = "sk-should-not-be-used";
      await writeFile(join(dir, "note.txt"), "not an image");
      const res = await describeImageTool.execute(
        { path: "note.txt" },
        makeCtx(dir),
      );
      expect(res.ok).toBe(false);
      expect(res.output).toContain("unsupported image type");
    });
  });

  describe("mimeForImage", () => {
    it("maps known image extensions case-insensitively", () => {
      expect(mimeForImage("a.png")).toBe("image/png");
      expect(mimeForImage("a.JPG")).toBe("image/jpeg");
      expect(mimeForImage("a.jpeg")).toBe("image/jpeg");
      expect(mimeForImage("a.webp")).toBe("image/webp");
      expect(mimeForImage("a.gif")).toBe("image/gif");
    });

    it("returns null for unsupported or missing extensions", () => {
      expect(mimeForImage("a.txt")).toBeNull();
      expect(mimeForImage("noext")).toBeNull();
    });
  });

  describe("describeForSafety", () => {
    it("returns only the path (no image content)", () => {
      expect(describeImageTool.describeForSafety?.({ path: "img/a.png" })).toBe(
        "analyze image img/a.png",
      );
    });

    it("tolerates a missing path", () => {
      expect(describeImageTool.describeForSafety?.({})).toBe("analyze image ");
    });
  });
});
