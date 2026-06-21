import { describe, it, expect } from "vitest";
import {
  shouldDream,
  resolveDreamConfig,
  recordDream,
  recordNewMemories,
  runDreamIfDue,
  newDreamState,
  type DreamConfig,
  type DreamState,
} from "./dream-service.js";

const cfg = (over: Partial<DreamConfig> = {}): DreamConfig => ({
  enabled: true,
  intervalMs: 6 * 60 * 60 * 1000,
  minNewMemories: 10,
  ...over,
});
const HOUR = 60 * 60 * 1000;
const NOW = 1_000_000_000_000;
/** A state where interval + new-memory threshold both pass (last dream long ago, plenty new). */
const ready = (over: Partial<DreamState> = {}): DreamState => ({
  lastDreamMs: NOW - 7 * HOUR,
  memoriesSinceLastDream: 10,
  ...over,
});

describe("shouldDream", () => {
  it("is due when enabled, the interval elapsed, and enough new memories accumulated", () => {
    expect(shouldDream(ready(), NOW, cfg())).toBe(true);
  });
  it("is not due when disabled", () => {
    expect(shouldDream(ready(), NOW, cfg({ enabled: false }))).toBe(false);
  });
  it("is not due when too soon since the last dream", () => {
    expect(shouldDream(ready({ lastDreamMs: NOW - 1 * HOUR }), NOW, cfg())).toBe(false);
  });
  it("is not due when too few new memories have accumulated", () => {
    expect(shouldDream(ready({ memoriesSinceLastDream: 3 }), NOW, cfg())).toBe(false);
  });
  it("is due exactly at the interval boundary with exactly the min new memories", () => {
    expect(shouldDream({ lastDreamMs: NOW - 6 * HOUR, memoriesSinceLastDream: 10 }, NOW, cfg())).toBe(true);
  });
});

describe("resolveDreamConfig", () => {
  it("is disabled by default", () => {
    expect(resolveDreamConfig({} as NodeJS.ProcessEnv).enabled).toBe(false);
  });
  it("is enabled by VANTA_AUTO_DREAM=1", () => {
    expect(resolveDreamConfig({ VANTA_AUTO_DREAM: "1" } as NodeJS.ProcessEnv).enabled).toBe(true);
  });
  it("reads interval + min-new-memory overrides", () => {
    const c = resolveDreamConfig({
      VANTA_AUTO_DREAM: "1",
      VANTA_DREAM_INTERVAL_MS: "60000",
      VANTA_DREAM_MIN_MEMORIES: "3",
    } as NodeJS.ProcessEnv);
    expect(c.intervalMs).toBe(60000);
    expect(c.minNewMemories).toBe(3);
  });
  it("falls back to defaults on non-positive / non-numeric overrides", () => {
    const c = resolveDreamConfig({ VANTA_DREAM_INTERVAL_MS: "0", VANTA_DREAM_MIN_MEMORIES: "abc" } as NodeJS.ProcessEnv);
    expect(c.intervalMs).toBe(6 * 60 * 60 * 1000);
    expect(c.minNewMemories).toBe(10);
  });
});

describe("recordDream", () => {
  it("stamps the dream time and resets the new-memory counter", () => {
    const s = recordDream({ lastDreamMs: 0, memoriesSinceLastDream: 42 }, NOW);
    expect(s.lastDreamMs).toBe(NOW);
    expect(s.memoriesSinceLastDream).toBe(0);
  });
});

describe("recordNewMemories", () => {
  it("accumulates new memories", () => {
    const s = recordNewMemories(recordNewMemories(newDreamState(), 2), 3);
    expect(s.memoriesSinceLastDream).toBe(5);
  });
  it("ignores non-positive counts", () => {
    expect(recordNewMemories({ lastDreamMs: 0, memoriesSinceLastDream: 4 }, -3).memoriesSinceLastDream).toBe(4);
  });
});

describe("runDreamIfDue", () => {
  function deps(over: Partial<Parameters<typeof runDreamIfDue>[0]> = {}) {
    let saved: DreamState | null = null;
    let consolidated = 0;
    const base = {
      getState: async (): Promise<DreamState> => ready(),
      saveState: async (s: DreamState): Promise<void> => { saved = s; },
      now: () => NOW,
      consolidate: async (): Promise<unknown> => { consolidated += 1; return undefined; },
      config: cfg(),
      ...over,
    };
    return { base, get saved() { return saved; }, get consolidated() { return consolidated; } };
  }

  it("runs consolidate and records the dream when due", async () => {
    const d = deps();
    const r = await runDreamIfDue(d.base);
    expect(r.dreamed).toBe(true);
    expect(d.consolidated).toBe(1);
    expect(d.saved).toEqual({ lastDreamMs: NOW, memoriesSinceLastDream: 0 });
  });

  it("is a no-op when not due (no consolidate, no save)", async () => {
    const d = deps({ getState: async () => ready({ memoriesSinceLastDream: 1 }) });
    const r = await runDreamIfDue(d.base);
    expect(r.dreamed).toBe(false);
    expect(d.consolidated).toBe(0);
    expect(d.saved).toBeNull();
  });

  it("is a no-op when disabled", async () => {
    const d = deps({ config: cfg({ enabled: false }) });
    const r = await runDreamIfDue(d.base);
    expect(r.dreamed).toBe(false);
    expect(d.consolidated).toBe(0);
    expect(d.saved).toBeNull();
  });

  it("best-effort: a consolidate throw leaves state untouched, never throws, dreamed:false", async () => {
    const d = deps({ consolidate: async () => { throw new Error("brain offline"); } });
    const r = await runDreamIfDue(d.base);
    expect(r.dreamed).toBe(false);
    expect(d.saved).toBeNull(); // no state change on failure
  });
});
