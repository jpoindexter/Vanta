import { describe, it, expect } from "vitest";
import {
  classifyHeap,
  resolveThresholds,
  buildMemoryWarning,
  checkMemory,
  type MemEnv,
} from "./memory-warn.js";

const GB = 1024 * 1024 * 1024;
const HIGH = 1.5 * GB;
const CRIT = 2.5 * GB;

describe("classifyHeap (defaults)", () => {
  it("returns ok below the high threshold", () => {
    expect(classifyHeap(0)).toBe("ok");
    expect(classifyHeap(HIGH - 1)).toBe("ok");
    expect(classifyHeap(1.0 * GB)).toBe("ok");
  });

  it("returns high at exactly the high threshold (inclusive)", () => {
    expect(classifyHeap(HIGH)).toBe("high");
  });

  it("returns high between high and critical thresholds", () => {
    expect(classifyHeap(2.0 * GB)).toBe("high");
    expect(classifyHeap(CRIT - 1)).toBe("high");
  });

  it("returns critical at exactly the critical threshold (inclusive)", () => {
    expect(classifyHeap(CRIT)).toBe("critical");
  });

  it("returns critical above the critical threshold", () => {
    expect(classifyHeap(3.0 * GB)).toBe("critical");
  });
});

describe("classifyHeap (explicit overrides)", () => {
  it("honors injected byte thresholds", () => {
    const opts = { highBytes: 100, critBytes: 200 };
    expect(classifyHeap(99, opts)).toBe("ok");
    expect(classifyHeap(100, opts)).toBe("high");
    expect(classifyHeap(199, opts)).toBe("high");
    expect(classifyHeap(200, opts)).toBe("critical");
  });
});

describe("classifyHeap (env overrides VANTA_MEM_HIGH_MB / VANTA_MEM_CRIT_MB)", () => {
  it("uses env-supplied MB thresholds", () => {
    const env: MemEnv = { VANTA_MEM_HIGH_MB: "1000", VANTA_MEM_CRIT_MB: "2000" };
    expect(classifyHeap(999 * 1024 * 1024, { env })).toBe("ok");
    expect(classifyHeap(1000 * 1024 * 1024, { env })).toBe("high");
    expect(classifyHeap(2000 * 1024 * 1024, { env })).toBe("critical");
  });

  it("explicit opts take precedence over env", () => {
    const env: MemEnv = { VANTA_MEM_HIGH_MB: "1000", VANTA_MEM_CRIT_MB: "2000" };
    // opts.highBytes wins; env crit still applies for the crit floor
    expect(classifyHeap(50, { highBytes: 50, env })).toBe("high");
  });

  it("falls back to ok when thresholds are malformed (never throws)", () => {
    const env: MemEnv = { VANTA_MEM_HIGH_MB: "abc" };
    expect(classifyHeap(5 * GB, { env })).toBe("ok");
  });
});

describe("resolveThresholds (errors as values)", () => {
  it("returns defaults with no opts", () => {
    const r = resolveThresholds();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.highBytes).toBe(HIGH);
      expect(r.value.critBytes).toBe(CRIT);
    }
  });

  it("errors on a non-numeric env value", () => {
    const r = resolveThresholds({ env: { VANTA_MEM_HIGH_MB: "nope" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("VANTA_MEM_HIGH_MB");
  });

  it("errors on a non-positive env value", () => {
    const r = resolveThresholds({ env: { VANTA_MEM_CRIT_MB: "0" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("VANTA_MEM_CRIT_MB");
  });

  it("errors when critical does not exceed high", () => {
    const r = resolveThresholds({ highBytes: 200, critBytes: 200 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("must exceed high");
  });
});

describe("buildMemoryWarning", () => {
  it("returns empty string for ok (silent)", () => {
    expect(buildMemoryWarning("ok", 5 * GB)).toBe("");
  });

  it("builds a one-line HIGH warning with GB figure", () => {
    const line = buildMemoryWarning("high", 1.5 * GB);
    expect(line).toContain("HIGH");
    expect(line).toContain("1.50 GB");
    expect(line.split("\n")).toHaveLength(1);
  });

  it("builds a one-line CRITICAL warning with GB figure", () => {
    const line = buildMemoryWarning("critical", 2.5 * GB);
    expect(line).toContain("CRITICAL");
    expect(line).toContain("2.50 GB");
    expect(line.split("\n")).toHaveLength(1);
  });
});

describe("checkMemory", () => {
  it("is silent below the high threshold", () => {
    const out = checkMemory({ readHeap: () => 1.0 * GB, now: () => 0 });
    expect(out.level).toBe("ok");
    expect(out.warning).toBe("");
  });

  it("emits a HIGH warning at the high threshold", () => {
    const out = checkMemory({ readHeap: () => HIGH, now: () => 1000 });
    expect(out.level).toBe("high");
    expect(out.warning).toContain("HIGH");
    expect(out.warnedAt).toBe(1000);
  });

  it("emits a CRITICAL warning at the critical threshold", () => {
    const out = checkMemory({ readHeap: () => CRIT, now: () => 1000 });
    expect(out.level).toBe("critical");
    expect(out.warning).toContain("CRITICAL");
    expect(out.warnedAt).toBe(1000);
  });

  it("suppresses a repeat warning within the cooldown window", () => {
    const out = checkMemory({
      readHeap: () => 2.0 * GB,
      now: () => 5_000,
      lastWarnedAt: 1_000,
      cooldownMs: 60_000,
    });
    expect(out.level).toBe("high");
    expect(out.warning).toBe("");
    // lastWarnedAt is preserved, not advanced
    expect(out.warnedAt).toBe(1_000);
  });

  it("re-warns once the cooldown window has elapsed", () => {
    const out = checkMemory({
      readHeap: () => 2.0 * GB,
      now: () => 70_000,
      lastWarnedAt: 1_000,
      cooldownMs: 60_000,
    });
    expect(out.warning).toContain("HIGH");
    expect(out.warnedAt).toBe(70_000);
  });

  it("threads warnedAt forward across silent (ok) checks", () => {
    const out = checkMemory({
      readHeap: () => 0.5 * GB,
      now: () => 9_999,
      lastWarnedAt: 1_000,
    });
    expect(out.level).toBe("ok");
    expect(out.warnedAt).toBe(1_000);
  });

  it("honors env threshold overrides through the check", () => {
    const env: MemEnv = { VANTA_MEM_HIGH_MB: "500", VANTA_MEM_CRIT_MB: "900" };
    const out = checkMemory({ readHeap: () => 600 * 1024 * 1024, now: () => 0, env });
    expect(out.level).toBe("high");
    expect(out.warning).toContain("HIGH");
  });
});
