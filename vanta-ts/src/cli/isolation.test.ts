import { describe, it, expect } from "vitest";
import {
  resolveIsolation,
  isolationLevel,
  isolationBanner,
  skipPlugins,
  skipHooks,
  skipSkills,
  skipMcp,
  skipProjectContext,
  type Isolation,
} from "./isolation.js";
import { parseIsolationFlags } from "./startup.js";

const NORMAL: Isolation = { safeMode: false, bare: false };
const SAFE: Isolation = { safeMode: true, bare: false };
const BARE: Isolation = { safeMode: false, bare: true };

describe("resolveIsolation", () => {
  it("returns both false for an empty env (default = nothing skipped)", () => {
    expect(resolveIsolation({})).toEqual(NORMAL);
  });

  it("reads VANTA_SAFE_MODE truthy values", () => {
    for (const v of ["1", "true", "yes", "on", "TRUE", " On "]) {
      expect(resolveIsolation({ VANTA_SAFE_MODE: v }).safeMode).toBe(true);
    }
  });

  it("reads VANTA_BARE truthy values", () => {
    for (const v of ["1", "true", "yes", "on"]) {
      expect(resolveIsolation({ VANTA_BARE: v }).bare).toBe(true);
    }
  });

  it("treats falsy / unset / garbage values as off", () => {
    expect(resolveIsolation({ VANTA_SAFE_MODE: "0", VANTA_BARE: "false" })).toEqual(NORMAL);
    expect(resolveIsolation({ VANTA_SAFE_MODE: "", VANTA_BARE: "nope" })).toEqual(NORMAL);
  });

  it("can resolve both flags simultaneously", () => {
    expect(resolveIsolation({ VANTA_SAFE_MODE: "1", VANTA_BARE: "1" })).toEqual({ safeMode: true, bare: true });
  });
});

describe("isolationLevel", () => {
  it("maps normal", () => expect(isolationLevel(NORMAL)).toBe("normal"));
  it("maps bare", () => expect(isolationLevel(BARE)).toBe("bare"));
  it("maps safe-mode", () => expect(isolationLevel(SAFE)).toBe("safe-mode"));
  it("safe-mode dominates bare when both set", () => {
    expect(isolationLevel({ safeMode: true, bare: true })).toBe("safe-mode");
  });
});

describe("skip matrix — safe-mode skips everything", () => {
  it("skips all five customization classes", () => {
    expect(skipPlugins(SAFE)).toBe(true);
    expect(skipHooks(SAFE)).toBe(true);
    expect(skipSkills(SAFE)).toBe(true);
    expect(skipMcp(SAFE)).toBe(true);
    expect(skipProjectContext(SAFE)).toBe(true);
  });
});

describe("skip matrix — bare skips discovery only", () => {
  it("skips skills, MCP, and project context", () => {
    expect(skipSkills(BARE)).toBe(true);
    expect(skipMcp(BARE)).toBe(true);
    expect(skipProjectContext(BARE)).toBe(true);
  });
  it("keeps hooks and plugins (lighter than safe-mode)", () => {
    expect(skipHooks(BARE)).toBe(false);
    expect(skipPlugins(BARE)).toBe(false);
  });
});

describe("skip matrix — neither flag skips nothing (default unchanged)", () => {
  it("loads every customization class", () => {
    expect(skipPlugins(NORMAL)).toBe(false);
    expect(skipHooks(NORMAL)).toBe(false);
    expect(skipSkills(NORMAL)).toBe(false);
    expect(skipMcp(NORMAL)).toBe(false);
    expect(skipProjectContext(NORMAL)).toBe(false);
  });

  it("resolveIsolation({}) skips nothing end-to-end", () => {
    const iso = resolveIsolation({});
    expect([skipPlugins(iso), skipHooks(iso), skipSkills(iso), skipMcp(iso), skipProjectContext(iso)]).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("isolationBanner", () => {
  it("returns an empty string for the normal level (no banner by default)", () => {
    expect(isolationBanner("normal")).toBe("");
  });
  it("describes total isolation for safe-mode", () => {
    const b = isolationBanner("safe-mode");
    expect(b).toContain("safe-mode");
    expect(b).toMatch(/hooks/i);
    expect(b).toMatch(/skills/i);
    expect(b).toMatch(/plugins/i);
    expect(b).toMatch(/MCP/);
    expect(b).toMatch(/project context/i);
  });
  it("describes discovery-only isolation for bare", () => {
    const b = isolationBanner("bare");
    expect(b).toContain("bare");
    expect(b).toMatch(/project context/i);
    expect(b).toMatch(/MCP/);
    expect(b).toMatch(/skills/i);
    expect(b).toMatch(/hooks and plugins still load/i);
  });
});

describe("parseIsolationFlags", () => {
  it("strips --safe-mode and sets VANTA_SAFE_MODE", () => {
    const parsed = parseIsolationFlags(["--safe-mode", "run", "hi"], {});
    expect(parsed.rest).toEqual(["run", "hi"]);
    expect(parsed.env.VANTA_SAFE_MODE).toBe("1");
    expect(parsed.env.VANTA_BARE).toBeUndefined();
  });

  it("strips --bare and sets VANTA_BARE", () => {
    const parsed = parseIsolationFlags(["chat", "--bare"], {});
    expect(parsed.rest).toEqual(["chat"]);
    expect(parsed.env.VANTA_BARE).toBe("1");
    expect(parsed.env.VANTA_SAFE_MODE).toBeUndefined();
  });

  it("supports both flags at once", () => {
    const parsed = parseIsolationFlags(["--safe-mode", "--bare", "run"], {});
    expect(parsed.rest).toEqual(["run"]);
    expect(parsed.env.VANTA_SAFE_MODE).toBe("1");
    expect(parsed.env.VANTA_BARE).toBe("1");
  });

  it("neither flag → env untouched, args passed through (byte-identical default)", () => {
    const env = { EXISTING: "x" };
    const parsed = parseIsolationFlags(["run", "do a thing"], env);
    expect(parsed.rest).toEqual(["run", "do a thing"]);
    expect(parsed.env).toEqual({ EXISTING: "x" });
    expect(parsed.env.VANTA_SAFE_MODE).toBeUndefined();
    expect(parsed.env.VANTA_BARE).toBeUndefined();
    expect(env).toEqual({ EXISTING: "x" }); // input env not mutated
  });
});
