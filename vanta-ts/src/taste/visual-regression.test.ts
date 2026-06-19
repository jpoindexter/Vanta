import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  snapshot, compareSnapshot, updateBaseline, pngDimensions, hashBytes, slugName,
} from "./visual-regression.js";

const FX = join(import.meta.dirname, "__fixtures__");
const BASE = readFileSync(join(FX, "app-base.png"));
const CHANGED = readFileSync(join(FX, "app-changed.png"));
const RESIZED = readFileSync(join(FX, "app-resized.png"));

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vanta-vr-"));
});

describe("pngDimensions", () => {
  it("parses IHDR width/height from a valid PNG", () => {
    expect(pngDimensions(BASE)).toEqual({ width: 2, height: 2 });
    expect(pngDimensions(RESIZED)).toEqual({ width: 3, height: 2 });
  });

  it("returns null for non-PNG bytes", () => {
    expect(pngDimensions(Buffer.from("not a png at all here"))).toBeNull();
    expect(pngDimensions(Buffer.alloc(4))).toBeNull();
  });
});

describe("hashBytes / slugName", () => {
  it("is a stable content hash", () => {
    expect(hashBytes(BASE)).toBe(hashBytes(BASE));
    expect(hashBytes(BASE)).not.toBe(hashBytes(CHANGED));
  });
  it("slugs unsafe names without traversal", () => {
    expect(slugName("../../etc/passwd")).toBe("etc-passwd");
    expect(slugName("My App!! Hero")).toBe("my-app-hero");
    expect(slugName("")).toBe("snapshot");
  });
});

describe("snapshot -> match -> regression -> rebaseline", () => {
  it("locks a baseline and records dims + hash", async () => {
    const meta = await snapshot("hero", BASE, dir);
    expect(meta).toMatchObject({ name: "hero", width: 2, height: 2, hash: hashBytes(BASE) });
    const stored = await readFile(join(dir, "hero.png"));
    expect(stored.equals(BASE)).toBe(true);
  });

  it("compares identical bytes as a match", async () => {
    await snapshot("hero", BASE, dir);
    const r = await compareSnapshot("hero", BASE, dir);
    expect(r.verdict).toBe("match");
    expect(r.reason).toBe("identical");
  });

  it("flags a same-size content change as a regression and writes the current image", async () => {
    await snapshot("hero", BASE, dir);
    const r = await compareSnapshot("hero", CHANGED, dir);
    expect(r.verdict).toBe("regression");
    expect(r.reason).toBe("content-changed");
    expect(r.currentPath).toBeDefined();
    const written = await readFile(r.currentPath!);
    expect(written.equals(CHANGED)).toBe(true);
  });

  it("distinguishes a dimension change", async () => {
    await snapshot("hero", BASE, dir);
    const r = await compareSnapshot("hero", RESIZED, dir);
    expect(r.verdict).toBe("regression");
    expect(r.reason).toBe("dimensions-changed");
    expect(r.baseline).toEqual({ width: 2, height: 2 });
    expect(r.current).toEqual({ width: 3, height: 2 });
  });

  it("rebaselines so the prior regression now matches", async () => {
    await snapshot("hero", BASE, dir);
    expect((await compareSnapshot("hero", CHANGED, dir)).verdict).toBe("regression");
    await updateBaseline("hero", CHANGED, dir);
    expect((await compareSnapshot("hero", CHANGED, dir)).verdict).toBe("match");
  });

  it("reports no-baseline before any snapshot exists", async () => {
    const r = await compareSnapshot("never-seen", BASE, dir);
    expect(r.verdict).toBe("no-baseline");
    expect(r.current).toEqual({ width: 2, height: 2 });
    expect(await readdir(dir)).toHaveLength(0);
  });

  it("rejects invalid PNG bytes on snapshot", async () => {
    await expect(snapshot("bad", Buffer.from("nope"), dir)).rejects.toThrow(/valid PNG/);
  });
});
