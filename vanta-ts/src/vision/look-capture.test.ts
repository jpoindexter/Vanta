import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureLook, screencaptureArgs } from "./look-capture.js";

const roots: string[] = [];
afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("look capture", () => {
  it("builds native full-screen, window, and marquee commands", () => {
    expect(screencaptureArgs("screen", "/tmp/c.png")).toEqual(["-x", "-tpng", "/tmp/c.png"]);
    expect(screencaptureArgs("window", "/tmp/c.png")).toEqual(["-x", "-i", "-W", "-w", "-tpng", "/tmp/c.png"]);
    expect(screencaptureArgs("marquee", "/tmp/c.png")).toEqual(["-x", "-i", "-s", "-tpng", "/tmp/c.png"]);
  });

  it("captures every display with Retina pixel metadata and scoped receipts", async () => {
    const root = await fixtureRoot();
    const now = new Date("2026-07-20T12:00:00.000Z");
    const result = await captureLook({ mode: "screen", scope: "/private/project" }, {
      root,
      now: () => now,
      run: async (args) => {
        const target = args.at(-1)!;
        await writePng(target, 2560, 1600);
        await writePng(target.replace(".png", " 2.png"), 1920, 1080);
      },
    });
    expect(result.status).toBe("captured");
    if (result.status !== "captured") return;
    expect(result.images).toHaveLength(2);
    const [first, second] = result.images;
    expect(first!.capture).toMatchObject({ source: "macos-screencapture", mode: "screen", display: 1, pixelWidth: 2560, pixelHeight: 1600 });
    expect(second!.capture).toMatchObject({ display: 2, pixelWidth: 1920, pixelHeight: 1080 });
    expect(first!.capture.scope).toMatch(/^[a-f0-9]{12}$/);
    expect(first!.capture.expiresAt).toBe("2026-07-20T12:05:00.000Z");
    expect(await readdir(join(root, first!.capture.scope))).toEqual([]);
  });

  it("treats an empty interactive result and Escape as cancellation", async () => {
    const root = await fixtureRoot();
    await expect(captureLook({ mode: "marquee", scope: "x" }, { root, run: async () => {} })).resolves.toEqual({ status: "cancelled" });
    await expect(captureLook({ mode: "window", scope: "x" }, { root, run: async () => { throw new Error("escape cancelled"); } })).resolves.toEqual({ status: "cancelled" });
  });

  it("opens Screen Recording settings on denial", async () => {
    const root = await fixtureRoot();
    const openSettings = vi.fn(async () => {});
    const result = await captureLook({ mode: "screen", scope: "x" }, {
      root,
      openSettings,
      run: async () => { throw new Error("not authorized for Screen Recording"); },
    });
    expect(result).toMatchObject({ status: "denied", recovery: expect.stringContaining("Privacy & Security") });
    expect(openSettings).toHaveBeenCalledOnce();
  });

  it("treats an all-black macOS image as Screen Recording denial", async () => {
    const root = await fixtureRoot();
    const openSettings = vi.fn(async () => {});
    const result = await captureLook({ mode: "screen", scope: "x" }, {
      root,
      openSettings,
      run: async (args) => writeBlackPng(args.at(-1)!),
    });
    expect(result).toMatchObject({ status: "denied", recovery: expect.stringContaining("Screen Recording") });
    expect(openSettings).toHaveBeenCalledOnce();
  });

  it("deletes oversized captures and offers a smaller marquee", async () => {
    const root = await fixtureRoot();
    const result = await captureLook({ mode: "screen", scope: "x", maxBytes: 8 }, {
      root,
      run: async (args) => writePng(args.at(-1)!, 10, 10),
    });
    expect(result).toMatchObject({ status: "oversized", recovery: expect.stringContaining("smaller marquee") });
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-look-test-"));
  roots.push(root);
  return root;
}

async function writeBlackPng(path: string): Promise<void> {
  const header = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(header);
  header.writeUInt32BE(1, 16);
  header.writeUInt32BE(1, 20);
  header[24] = 8;
  header[25] = 6;
  const data = deflateSync(Buffer.from([0, 0, 0, 0, 255]));
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write("IDAT", 4, "ascii");
  data.copy(chunk, 8);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.concat([header, chunk]));
}

async function writePng(path: string, width: number, height: number): Promise<void> {
  const header = Buffer.alloc(32);
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(header);
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, header);
  expect((await readFile(path)).length).toBe(32);
}
