import { describe, expect, it } from "vitest";
import { ansiToPng, copyAnsiToClipboard, encodePng } from "./ansi-png.js";

function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("ansi PNG renderer", () => {
  it("encodes a valid RGBA PNG with dimensions in IHDR", () => {
    const rgba = Buffer.alloc(2 * 1 * 4, 255);
    const png = encodePng(2, 1, rgba);
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(pngSize(png)).toEqual({ width: 2, height: 1 });
  });

  it("renders ANSI-colored terminal text to a PNG buffer", () => {
    const png = ansiToPng("\x1b[31mFAIL\x1b[0m\nok", { scale: 1, padding: 2 });
    expect(png.slice(1, 4).toString("ascii")).toBe("PNG");
    expect(pngSize(png).width).toBeGreaterThan(20);
    expect(pngSize(png).height).toBeGreaterThan(10);
  });

  it("supports clipboard dry-run without touching the host clipboard", async () => {
    const result = await copyAnsiToClipboard("hello", { VANTA_TEST_CLIPBOARD: "1" } as NodeJS.ProcessEnv);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes).toBeGreaterThan(100);
  });
});
