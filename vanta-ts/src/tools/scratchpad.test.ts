import { describe, it, expect } from "vitest";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mkdtempSync, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { scratchpadDir, isInScratchpad, ensureScratchpad } from "./scratchpad.js";
import { resolveWritableZones, isInZone } from "./writable-zones.js";

const tmpHome = (): NodeJS.ProcessEnv =>
  ({ VANTA_HOME: mkdtempSync(join(tmpdir(), "vanta-scratch-")) }) as NodeJS.ProcessEnv;

describe("scratchpadDir", () => {
  it("defaults to <vanta-home>/scratch", () => {
    const home = mkdtempSync(join(tmpdir(), "vanta-h-"));
    expect(scratchpadDir({ VANTA_HOME: home } as NodeJS.ProcessEnv)).toBe(join(home, "scratch"));
  });

  it("falls back to ~/.vanta/scratch when no VANTA_HOME is set", () => {
    expect(scratchpadDir({} as NodeJS.ProcessEnv)).toBe(join(homedir(), ".vanta", "scratch"));
  });

  it("honors the VANTA_SCRATCHPAD_DIR override (absolute)", () => {
    const env = { VANTA_SCRATCHPAD_DIR: "/tmp/my-scratch" } as NodeJS.ProcessEnv;
    expect(scratchpadDir(env)).toBe("/tmp/my-scratch");
  });

  it("VANTA_SCRATCHPAD_DIR wins over VANTA_HOME", () => {
    const env = { VANTA_HOME: "/home/x/.vanta", VANTA_SCRATCHPAD_DIR: "/scratch/here" } as NodeJS.ProcessEnv;
    expect(scratchpadDir(env)).toBe("/scratch/here");
  });

  it("resolves a relative override to an absolute path", () => {
    const env = { VANTA_SCRATCHPAD_DIR: "rel/scratch" } as NodeJS.ProcessEnv;
    expect(scratchpadDir(env)).toBe(resolve("rel/scratch"));
  });
});

describe("isInScratchpad", () => {
  const env = { VANTA_SCRATCHPAD_DIR: "/tmp/scratch" } as NodeJS.ProcessEnv;

  it("is true for a file directly inside the scratchpad", () => {
    expect(isInScratchpad("/tmp/scratch/note.txt", env)).toBe(true);
  });

  it("is true for a nested file inside the scratchpad", () => {
    expect(isInScratchpad("/tmp/scratch/sub/dir/a.json", env)).toBe(true);
  });

  it("is true for the scratchpad dir itself", () => {
    expect(isInScratchpad("/tmp/scratch", env)).toBe(true);
  });

  it("is false for a path outside the scratchpad", () => {
    expect(isInScratchpad("/tmp/other/note.txt", env)).toBe(false);
  });

  it("is false for a prefix-collision sibling (scratch-evil)", () => {
    expect(isInScratchpad("/tmp/scratch-evil/note.txt", env)).toBe(false);
  });
});

describe("ensureScratchpad", () => {
  it("creates the scratchpad dir and returns its path", async () => {
    const env = tmpHome();
    const r = await ensureScratchpad({ mkdir }, env);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dir).toBe(scratchpadDir(env));
      expect(existsSync(r.dir)).toBe(true);
    }
  });

  it("is idempotent — a second call succeeds on an existing dir", async () => {
    const env = tmpHome();
    await ensureScratchpad({ mkdir }, env);
    const r = await ensureScratchpad({ mkdir }, env);
    expect(r.ok).toBe(true);
  });

  it("returns an error value (never throws) when mkdir fails", async () => {
    const failingFs = { mkdir: async () => { throw new Error("EACCES"); } };
    const r = await ensureScratchpad(failingFs, { VANTA_SCRATCHPAD_DIR: "/tmp/x" } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("EACCES");
  });
});

describe("scratchpad is a writable zone", () => {
  it("resolveWritableZones includes the scratchpad dir (default zones)", () => {
    const env = { VANTA_SCRATCHPAD_DIR: "/tmp/scratch" } as NodeJS.ProcessEnv;
    expect(resolveWritableZones(env)).toContain("/tmp/scratch");
  });

  it("scratchpad stays writable even when VANTA_WRITABLE_DIRS replaces the defaults", () => {
    const env = { VANTA_WRITABLE_DIRS: "/srv/out", VANTA_SCRATCHPAD_DIR: "/tmp/scratch" } as NodeJS.ProcessEnv;
    const zones = resolveWritableZones(env);
    expect(zones).toContain("/srv/out");
    expect(zones).toContain("/tmp/scratch");
  });

  it("a scratchpad file is judged in-zone by isInZone", () => {
    const env = { VANTA_SCRATCHPAD_DIR: "/tmp/scratch" } as NodeJS.ProcessEnv;
    expect(isInZone("/tmp/scratch/tmp.txt", resolveWritableZones(env))).toBe(true);
  });

  it("does not over-widen — a non-scratch out-of-zone path stays out", () => {
    const env = { VANTA_SCRATCHPAD_DIR: "/tmp/scratch" } as NodeJS.ProcessEnv;
    expect(isInZone("/var/elsewhere/x", resolveWritableZones(env))).toBe(false);
  });
});
