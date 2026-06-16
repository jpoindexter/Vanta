import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { snapshotDir, withFrozen } from "./snapshot.js";

describe("snapshotDir", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "vanta-snap-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("restore() reverts edits made after the snapshot", () => {
    writeFileSync(join(dir, "a.md"), "original");
    const snap = snapshotDir(dir);
    writeFileSync(join(dir, "a.md"), "mutated");
    writeFileSync(join(dir, "b.md"), "new file");
    snap.restore();
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("original");
    expect(existsSync(join(dir, "b.md"))).toBe(false);
  });

  it("discard() keeps edits (the kept-on-lift path)", () => {
    writeFileSync(join(dir, "a.md"), "original");
    const snap = snapshotDir(dir);
    writeFileSync(join(dir, "a.md"), "mutated");
    snap.discard();
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("mutated");
  });

  it("restore() removes a dir that did not exist at snapshot time", () => {
    const fresh = join(dir, "sub", "brain");
    const snap = snapshotDir(fresh);
    mkdirSync(fresh, { recursive: true });
    writeFileSync(join(fresh, "x.md"), "created");
    snap.restore();
    expect(existsSync(fresh)).toBe(false);
  });
});

describe("withFrozen", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "vanta-frozen-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("reverts mutations fn made, and still returns fn's value", async () => {
    writeFileSync(join(dir, "brain.md"), "frozen");
    const out = await withFrozen(dir, async () => {
      writeFileSync(join(dir, "brain.md"), "agent scribbled here");
      return 42;
    });
    expect(out).toBe(42);
    expect(readFileSync(join(dir, "brain.md"), "utf8")).toBe("frozen");
  });

  it("restores even when fn throws", async () => {
    writeFileSync(join(dir, "brain.md"), "frozen");
    await expect(withFrozen(dir, async () => {
      writeFileSync(join(dir, "brain.md"), "half-written");
      throw new Error("boom");
    })).rejects.toThrow("boom");
    expect(readFileSync(join(dir, "brain.md"), "utf8")).toBe("frozen");
  });
});
