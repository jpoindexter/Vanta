import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { homedir } from "node:os";
import {
  buildBwrapArgs,
  buildSeatbeltProfile,
  detectBackend,
  wrapCommand,
} from "./profile.js";
import { DANGEROUS_DIRS, expandHome } from "../tools/writable-zones.js";

const ROOT = "/Users/x/proj";
const ZONES = [resolve(expandHome("~/Desktop")), resolve(expandHome("~/Downloads"))];
const DANGER_ABS = DANGEROUS_DIRS.map((p) => resolve(expandHome(p)));

describe("buildSeatbeltProfile", () => {
  it("denies by default and is version 1", () => {
    const p = buildSeatbeltProfile(ROOT, ZONES, { net: false });
    expect(p).toContain("(version 1)");
    expect(p).toContain("(deny default)");
  });

  it("binds the project root and every writable zone for write", () => {
    const p = buildSeatbeltProfile(ROOT, ZONES, { net: false });
    expect(p).toContain(`(allow file-write* (subpath "${resolve(ROOT)}"))`);
    for (const z of ZONES) {
      expect(p).toContain(`(allow file-write* (subpath "${z}"))`);
    }
  });

  it("denies EVERY dangerous dir (credential/system floor)", () => {
    const p = buildSeatbeltProfile(ROOT, ZONES, { net: false });
    for (const d of DANGER_ABS) {
      expect(p).toContain(`(deny file* (subpath "${d}"))`);
    }
  });

  it("places dangerous-dir denies AFTER the broad read-allow (last-match-wins)", () => {
    const p = buildSeatbeltProfile(ROOT, ZONES, { net: false });
    const readAllowIdx = p.indexOf("(allow file-read*)");
    expect(readAllowIdx).toBeGreaterThan(-1);
    for (const d of DANGER_ABS) {
      const denyIdx = p.indexOf(`(deny file* (subpath "${d}"))`);
      // The deny must come AFTER the read-allow or it is dead (allow would win).
      expect(denyIdx).toBeGreaterThan(readAllowIdx);
    }
  });

  it("denies network unless opts.net", () => {
    expect(buildSeatbeltProfile(ROOT, ZONES, { net: false })).toContain("(deny network*)");
    expect(buildSeatbeltProfile(ROOT, ZONES, { net: true })).not.toContain("(deny network*)");
  });

  it("INVARIANT: the only file-write allows are root + zones — nothing else", () => {
    const p = buildSeatbeltProfile(ROOT, ZONES, { net: false });
    const writeAllows = p
      .split("\n")
      .filter((l) => l.includes("file-write*") && l.startsWith("(allow"));
    const expected = [resolve(ROOT), ...ZONES];
    expect(writeAllows).toHaveLength(expected.length);
    for (const z of expected) {
      expect(writeAllows.some((l) => l.includes(`"${z}"`))).toBe(true);
    }
    // No unscoped write allow (would defeat the invariant).
    expect(p).not.toMatch(/\(allow file-write\*\)\s*$/m);
  });

  it("allows process-exec* so the interpreter can run", () => {
    const p = buildSeatbeltProfile(ROOT, ZONES, { net: false });
    expect(p).toContain("(allow process-exec*)");
  });
});

describe("buildBwrapArgs", () => {
  it("ro-binds the whole fs (read), binds root + zones (write)", () => {
    const a = buildBwrapArgs(ROOT, ZONES, { net: false });
    expect(a.slice(0, 3)).toEqual(["--ro-bind", "/", "/"]);
    const j = a.join(" ");
    expect(j).toContain(`--bind ${resolve(ROOT)} ${resolve(ROOT)}`);
    for (const z of ZONES) expect(j).toContain(`--bind ${z} ${z}`);
  });

  it("tmpfs-masks every dangerous dir not inside a writable zone", () => {
    const a = buildBwrapArgs(ROOT, ZONES, { net: false });
    const j = a.join(" ");
    // ZONES (Desktop/Downloads) don't overlap the dangerous dirs, so all are masked.
    for (const d of DANGER_ABS) expect(j).toContain(`--tmpfs ${d}`);
  });

  it("does NOT tmpfs-mask a dangerous dir that sits inside a writable zone", () => {
    // If a writable zone CONTAINS a dangerous dir, the mask must be skipped so it
    // can't clobber the zone's bind. Pass the home dir as a zone → ~/.ssh is inside.
    const home = resolve(expandHome("~"));
    const a = buildBwrapArgs(ROOT, [home], { net: false });
    const sshAbs = resolve(expandHome("~/.ssh"));
    expect(a.join(" ")).not.toContain(`--tmpfs ${sshAbs}`);
  });

  it("applies tmpfs masks BEFORE writable binds (binds win last)", () => {
    const a = buildBwrapArgs(ROOT, ZONES, { net: false });
    const firstBind = a.indexOf("--bind");
    const lastTmpfs = a.lastIndexOf("--tmpfs");
    expect(lastTmpfs).toBeLessThan(firstBind);
  });

  it("unshares the network unless opts.net, and dies with parent", () => {
    expect(buildBwrapArgs(ROOT, ZONES, { net: false })).toContain("--unshare-net");
    expect(buildBwrapArgs(ROOT, ZONES, { net: true })).not.toContain("--unshare-net");
    expect(buildBwrapArgs(ROOT, ZONES, { net: false })).toContain("--die-with-parent");
  });

  it("ends with -- so the wrapped command is separated", () => {
    const a = buildBwrapArgs(ROOT, ZONES, { net: false });
    expect(a.at(-1)).toBe("--");
  });

  it("INVARIANT: only root + zones are --bind (writable); nothing outside", () => {
    const a = buildBwrapArgs(ROOT, ZONES, { net: false });
    const bound: string[] = [];
    for (let i = 0; i < a.length; i++) {
      const next = a[i + 1];
      if (a[i] === "--bind" && next !== undefined) bound.push(next);
    }
    expect(bound.sort()).toEqual([resolve(ROOT), ...ZONES].sort());
  });
});

describe("detectBackend", () => {
  it("darwin → seatbelt", () => expect(detectBackend("darwin")).toBe("seatbelt"));
  it("linux → bwrap", () => expect(detectBackend("linux")).toBe("bwrap"));
  it("win32 → null", () => expect(detectBackend("win32")).toBeNull());
  it("freebsd → null", () => expect(detectBackend("freebsd")).toBeNull());
});

describe("wrapCommand", () => {
  it("seatbelt → sandbox-exec -f <profile> <argv>", () => {
    const w = wrapCommand("seatbelt", "/tmp/p.sb", ["sh", "-c", "echo hi"]);
    expect(w).toEqual({ cmd: "sandbox-exec", args: ["-f", "/tmp/p.sb", "sh", "-c", "echo hi"] });
  });

  it("bwrap → bwrap <args> <argv>", () => {
    const w = wrapCommand("bwrap", ["--unshare-net", "--"], ["sh", "-c", "echo hi"]);
    expect(w).toEqual({ cmd: "bwrap", args: ["--unshare-net", "--", "sh", "-c", "echo hi"] });
  });

  it("throws if seatbelt gets args instead of a profile path", () => {
    expect(() => wrapCommand("seatbelt", ["x"], ["sh"])).toThrow();
  });

  it("throws if bwrap gets a string instead of args", () => {
    expect(() => wrapCommand("bwrap", "/tmp/p.sb", ["sh"])).toThrow();
  });
});

describe("home expansion sanity", () => {
  it("dangerous dirs resolve under the real home", () => {
    expect(DANGER_ABS).toContain(resolve(homedir(), ".ssh"));
  });
});
