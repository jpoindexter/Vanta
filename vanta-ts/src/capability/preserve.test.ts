import { describe, it, expect } from "vitest";
import {
  assessChangeMagnitude,
  isRiskyChange,
  buildCapabilitySurface,
  resolveCapabilityConfig,
  ChangeSummarySchema,
  type ChangeSummary,
} from "./preserve.js";

const ON = { enabled: true };

function change(over: Partial<ChangeSummary> = {}): ChangeSummary {
  return { files: [], why: "tidy up", ...over };
}

describe("assessChangeMagnitude", () => {
  it("returns small for few files and few lines", () => {
    const c = change({ files: [{ path: "a.ts", additions: 10, deletions: 5 }], why: "fix" });
    expect(assessChangeMagnitude(c)).toBe("small");
  });

  it("returns large when many files are touched", () => {
    const files = Array.from({ length: 4 }, (_, i) => ({ path: `f${i}.ts`, additions: 1, deletions: 0 }));
    expect(assessChangeMagnitude(change({ files }))).toBe("large");
  });

  it("returns large when line count crosses the threshold even with one file", () => {
    const c = change({ files: [{ path: "big.ts", additions: 90, deletions: 0 }] });
    expect(assessChangeMagnitude(c)).toBe("large");
  });
});

describe("isRiskyChange", () => {
  it("is false for an ordinary small code edit", () => {
    expect(isRiskyChange(change({ files: [{ path: "src/util.ts", additions: 5, deletions: 1 }] }))).toBe(false);
  });

  it("flags a migration / schema path", () => {
    expect(isRiskyChange(change({ files: [{ path: "db/migrations/003_add_users.sql", additions: 20, deletions: 0 }] }))).toBe(true);
  });

  it("flags an auth path", () => {
    expect(isRiskyChange(change({ files: [{ path: "src/features/auth/login.ts", additions: 8, deletions: 2 }] }))).toBe(true);
  });

  it("flags a secret/credential file", () => {
    expect(isRiskyChange(change({ files: [{ path: ".env", additions: 1, deletions: 0 }] }))).toBe(true);
  });

  it("flags a kernel-protected path (the safety boundary)", () => {
    expect(isRiskyChange(change({ files: [{ path: "src/safety.rs", additions: 3, deletions: 1 }] }))).toBe(true);
  });

  it("flags a pure deletion (lines removed, none added)", () => {
    expect(isRiskyChange(change({ files: [{ path: "src/old.ts", additions: 0, deletions: 40 }] }))).toBe(true);
  });

  it("flags a why that mentions an irreversible action", () => {
    expect(isRiskyChange(change({ why: "run the prod database migration" }))).toBe(true);
  });

  it("honors an explicit risky override", () => {
    expect(isRiskyChange(change({ risky: true, files: [{ path: "src/util.ts", additions: 1, deletions: 0 }] }))).toBe(true);
  });
});

describe("buildCapabilitySurface", () => {
  it("small non-risky change → summary only, no probe", () => {
    const c = change({ files: [{ path: "src/util.ts", additions: 3, deletions: 1 }], why: "rename a local variable" });
    const surface = buildCapabilitySurface(c, ON);
    expect(surface.summary).toContain("rename a local variable");
    expect(surface.probe).toBeUndefined();
  });

  it("summary is plain English with the WHY, not a raw diff", () => {
    const c = change({ files: [{ path: "src/util.ts", additions: 3, deletions: 1 }], why: "cache the result to avoid a re-fetch" });
    const surface = buildCapabilitySurface(c, ON);
    expect(surface.summary).toContain("Why: cache the result to avoid a re-fetch");
    expect(surface.summary).not.toContain("@@"); // no hunk headers
    expect(surface.summary).not.toContain("+++"); // no diff markers
  });

  it("large change → probe present", () => {
    const files = Array.from({ length: 5 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 20, deletions: 5 }));
    const surface = buildCapabilitySurface(change({ files, why: "refactor the module" }), ON);
    expect(surface.probe).toBeTruthy();
    expect(surface.probe).toMatch(/large change|what would break/i);
  });

  it("risky change (migration) → probe present and specific", () => {
    const c = change({ files: [{ path: "db/migrations/004.sql", additions: 12, deletions: 0 }], why: "add a column" });
    const surface = buildCapabilitySurface(c, ON);
    expect(surface.probe).toMatch(/schema|migration|reversible/i);
  });

  it("risky change (secret) → probe asks about exposure", () => {
    const c = change({ files: [{ path: "src/config.ts", additions: 4, deletions: 0 }], why: "load the api key from env" });
    const surface = buildCapabilitySurface(c, ON);
    expect(surface.probe).toMatch(/secret|credential|exposed/i);
  });

  it("disabled config → surface suppressed (empty summary, no probe)", () => {
    const c = change({ files: [{ path: "db/migrations/x.sql", additions: 50, deletions: 0 }], why: "big risky migration" });
    const surface = buildCapabilitySurface(c, { enabled: false });
    expect(surface.summary).toBe("");
    expect(surface.probe).toBeUndefined();
  });
});

describe("resolveCapabilityConfig", () => {
  it("is disabled by default (env unset)", () => {
    expect(resolveCapabilityConfig({})).toEqual({ enabled: false });
  });

  it("enables on '1'", () => {
    expect(resolveCapabilityConfig({ VANTA_CAPABILITY_PRESERVE: "1" })).toEqual({ enabled: true });
  });

  it("enables on truthy words and ignores case/whitespace", () => {
    expect(resolveCapabilityConfig({ VANTA_CAPABILITY_PRESERVE: " True " }).enabled).toBe(true);
    expect(resolveCapabilityConfig({ VANTA_CAPABILITY_PRESERVE: "on" }).enabled).toBe(true);
  });

  it("stays disabled on other values", () => {
    expect(resolveCapabilityConfig({ VANTA_CAPABILITY_PRESERVE: "0" }).enabled).toBe(false);
    expect(resolveCapabilityConfig({ VANTA_CAPABILITY_PRESERVE: "off" }).enabled).toBe(false);
  });
});

describe("ChangeSummarySchema", () => {
  it("rejects a change with no why", () => {
    expect(ChangeSummarySchema.safeParse({ files: [] }).success).toBe(false);
  });

  it("defaults file deltas to zero", () => {
    const parsed = ChangeSummarySchema.parse({ files: [{ path: "a.ts" }], why: "x" });
    expect(parsed.files[0]).toEqual({ path: "a.ts", additions: 0, deletions: 0 });
  });
});
