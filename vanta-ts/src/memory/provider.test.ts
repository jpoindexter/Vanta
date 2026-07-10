import { describe, it, expect, vi } from "vitest";
import {
  MEMORY_CATALOG,
  memoryProviderById,
  memoryProviderAvailability,
  resolveMemoryProvider,
  localMemoryProvider,
  type Brain,
  type BrainEntry,
  type RecallResult,
} from "./provider.js";
import { MEMORY_LIFECYCLE_HOOKS } from "../brain/interface.js";

// MEMORY-PROVIDER-FRAMEWORK — the port + catalog. Pure catalog helpers, and the
// guarantee that unconfigured = local (no behavior change). Mirrors the
// registry + brain-interface test style: no network, no real store.

const FULL_ENV: NodeJS.ProcessEnv = {
  VANTA_MEMORY: "qdrant",
  VANTA_MEMORY_QDRANT_URL: "http://localhost:6333",
  VANTA_MEMORY_QDRANT_KEY: "secret",
};

/** A spy Brain so we can assert the local adapter delegates to the Brain port. */
function spyBrain(): { brain: Brain; remember: ReturnType<typeof vi.fn>; recall: ReturnType<typeof vi.fn> } {
  const entry = { id: "e1", region: "semantic", content: "hi" } as unknown as BrainEntry;
  const result = { entries: [], formatted: "", activations: [] } as RecallResult;
  const remember = vi.fn(async () => entry);
  const recall = vi.fn(async () => result);
  const brain: Brain = {
    id: "live",
    lifecycleHooks: MEMORY_LIFECYCLE_HOOKS,
    read: vi.fn(async () => null),
    write: vi.fn(async () => {}),
    remember,
    recall,
    digest: vi.fn(async () => ""),
    health: vi.fn(async () => ({}) as Awaited<ReturnType<Brain["health"]>>),
  };
  return { brain, remember, recall };
}

describe("memory catalog", () => {
  it("every entry has the required catalog fields", () => {
    for (const m of MEMORY_CATALOG) {
      expect(typeof m.id).toBe("string");
      expect(m.id.length).toBeGreaterThan(0);
      expect(typeof m.label).toBe("string");
      expect(["storage", "service", "local"]).toContain(m.kind);
      expect(typeof m.implemented).toBe("boolean");
      expect(Array.isArray(m.requiredEnv)).toBe(true);
      expect(m.setupSteps.length).toBeGreaterThan(0);
      expect(typeof m.whatItDoes).toBe("string");
      expect(m.whatItDoes.length).toBeGreaterThan(0);
    }
  });

  it("includes the local default (no env) plus documented future backends", () => {
    const local = memoryProviderById("local")!;
    expect(local.kind).toBe("local");
    expect(local.implemented).toBe(true);
    expect(local.requiredEnv).toEqual([]);
    // At least one planned storage + one planned service entry, catalog-only.
    const planned = MEMORY_CATALOG.filter((m) => !m.implemented);
    expect(planned.length).toBeGreaterThanOrEqual(1);
    expect(planned.map((m) => m.kind)).toContain("service");
  });

  it("a secret-bearing entry names its secretEnv inside requiredEnv", () => {
    for (const m of MEMORY_CATALOG) {
      if (m.secretEnv) expect(m.requiredEnv).toContain(m.secretEnv);
    }
  });

  it("looks an entry up by id", () => {
    expect(memoryProviderById("local")?.label).toBe("Local brain (default)");
    expect(memoryProviderById("nope")).toBeUndefined();
  });
});

describe("memoryProviderAvailability", () => {
  it("local is always available and flagged local, with no missing env", () => {
    const local = memoryProviderById("local")!;
    const a = memoryProviderAvailability(local, {});
    expect(a).toEqual({ configured: true, missing: [], available: true, local: true });
  });

  it("a service entry needs its env, and stays unavailable until implemented", () => {
    const qdrant = memoryProviderById("qdrant")!;
    expect(memoryProviderAvailability(qdrant, {}).missing).toEqual([
      "VANTA_MEMORY_QDRANT_URL",
      "VANTA_MEMORY_QDRANT_KEY",
    ]);
    expect(memoryProviderAvailability(qdrant, {}).configured).toBe(false);
    // Fully configured → configured:true, but available:false (adapter not built).
    const full = memoryProviderAvailability(qdrant, FULL_ENV);
    expect(full.configured).toBe(true);
    expect(full.available).toBe(false);
    expect(full.local).toBe(false);
  });

  it("treats a blank env value as missing", () => {
    const qdrant = memoryProviderById("qdrant")!;
    const partial = { VANTA_MEMORY_QDRANT_URL: "http://x", VANTA_MEMORY_QDRANT_KEY: "   " };
    expect(memoryProviderAvailability(qdrant, partial).configured).toBe(false);
    expect(memoryProviderAvailability(qdrant, partial).missing).toEqual(["VANTA_MEMORY_QDRANT_KEY"]);
  });
});

describe("resolveMemoryProvider", () => {
  it("defaults to local when unconfigured (no behavior change)", () => {
    expect(resolveMemoryProvider({}).id).toBe("local");
  });

  it("returns local for explicit VANTA_MEMORY=local", () => {
    expect(resolveMemoryProvider({ VANTA_MEMORY: "local" }).id).toBe("local");
  });

  it("falls back to local for an unknown backend id", () => {
    expect(resolveMemoryProvider({ VANTA_MEMORY: "does-not-exist" }).id).toBe("local");
  });

  it("falls back to local for a planned backend even when fully configured", () => {
    // qdrant is configured here but its adapter isn't built → must not activate.
    expect(resolveMemoryProvider(FULL_ENV).id).toBe("local");
  });
});

describe("local adapter pass-through", () => {
  it("delegates remember to the brain with the default region + content", async () => {
    const { brain, remember } = spyBrain();
    const mp = localMemoryProvider(brain);
    await mp.remember("a fact");
    expect(remember).toHaveBeenCalledWith({ region: "semantic", content: "a fact", env: undefined });
  });

  it("honors an explicit region on remember", async () => {
    const { brain, remember } = spyBrain();
    await localMemoryProvider(brain).remember("a pref", { region: "user_model" });
    expect(remember).toHaveBeenCalledWith({ region: "user_model", content: "a pref", env: undefined });
  });

  it("delegates recall to the brain with the query and topK", async () => {
    const { brain, recall } = spyBrain();
    const mp = localMemoryProvider(brain);
    const out = await mp.recall("what do I know", { topK: 3 });
    expect(recall).toHaveBeenCalledWith({ query: "what do I know", topK: 3, region: undefined, env: undefined });
    expect(out.formatted).toBe("");
  });
});
