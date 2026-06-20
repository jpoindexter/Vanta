import { describe, it, expect } from "vitest";
import {
  MemorySettingsSchema,
  resolveMemorySettings,
  isMemoryExcluded,
} from "./memory-settings.js";

const NO_ENV: NodeJS.ProcessEnv = {};

describe("MemorySettingsSchema", () => {
  it("accepts a full memory block", () => {
    const parsed = MemorySettingsSchema.safeParse({
      autoMemory: true,
      excludes: ["secret", "*.env"],
      plansDir: "docs/plans",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty block (all fields optional)", () => {
    expect(MemorySettingsSchema.safeParse({}).success).toBe(true);
  });

  it("rejects unknown keys (strict)", () => {
    expect(MemorySettingsSchema.safeParse({ bogus: 1 }).success).toBe(false);
  });

  it("rejects a wrong-typed field", () => {
    expect(MemorySettingsSchema.safeParse({ autoMemory: "yes" }).success).toBe(false);
    expect(MemorySettingsSchema.safeParse({ excludes: "secret" }).success).toBe(false);
  });
});

describe("resolveMemorySettings — defaults preserve today's behavior", () => {
  it("unset → autoMemory off, no excludes, no plansDir", () => {
    const eff = resolveMemorySettings({}, NO_ENV);
    expect(eff.autoMemory).toBe(false);
    expect(eff.excludes).toEqual([]);
    expect(eff.plansDir).toBeUndefined();
  });

  it("empty memory block → same as unset", () => {
    const eff = resolveMemorySettings({ memory: {} }, NO_ENV);
    expect(eff).toEqual({ autoMemory: false, excludes: [], plansDir: undefined });
  });
});

describe("resolveMemorySettings — settings block", () => {
  it("autoMemory on enables extraction mapping", () => {
    const eff = resolveMemorySettings({ memory: { autoMemory: true } }, NO_ENV);
    expect(eff.autoMemory).toBe(true);
  });

  it("reads excludes and plansDir from settings", () => {
    const eff = resolveMemorySettings(
      { memory: { excludes: ["api_key"], plansDir: "docs/plans" } },
      NO_ENV,
    );
    expect(eff.excludes).toEqual(["api_key"]);
    expect(eff.plansDir).toBe("docs/plans");
  });
});

describe("resolveMemorySettings — env overrides settings", () => {
  it("VANTA_AUTO_MEMORY overrides settings.memory.autoMemory", () => {
    const on = resolveMemorySettings(
      { memory: { autoMemory: false } },
      { VANTA_AUTO_MEMORY: "1" },
    );
    expect(on.autoMemory).toBe(true);
    const off = resolveMemorySettings(
      { memory: { autoMemory: true } },
      { VANTA_AUTO_MEMORY: "0" },
    );
    expect(off.autoMemory).toBe(false);
  });

  it("accepts true/on/yes and false/off/no (case-insensitive)", () => {
    for (const v of ["true", "ON", "Yes"]) {
      expect(resolveMemorySettings({}, { VANTA_AUTO_MEMORY: v }).autoMemory).toBe(true);
    }
    for (const v of ["false", "OFF", "No"]) {
      expect(
        resolveMemorySettings({ memory: { autoMemory: true } }, { VANTA_AUTO_MEMORY: v })
          .autoMemory,
      ).toBe(false);
    }
  });

  it("a junk VANTA_AUTO_MEMORY value falls back to the settings value", () => {
    const eff = resolveMemorySettings(
      { memory: { autoMemory: true } },
      { VANTA_AUTO_MEMORY: "maybe" },
    );
    expect(eff.autoMemory).toBe(true);
  });

  it("VANTA_MEMORY_EXCLUDES (comma list) overrides settings.memory.excludes", () => {
    const eff = resolveMemorySettings(
      { memory: { excludes: ["from-settings"] } },
      { VANTA_MEMORY_EXCLUDES: "  token , password ,, secret " },
    );
    expect(eff.excludes).toEqual(["token", "password", "secret"]);
  });

  it("VANTA_PLANS_DIR overrides settings.memory.plansDir", () => {
    const eff = resolveMemorySettings(
      { memory: { plansDir: "docs/plans" } },
      { VANTA_PLANS_DIR: "/abs/plans" },
    );
    expect(eff.plansDir).toBe("/abs/plans");
  });

  it("a blank VANTA_PLANS_DIR falls back to the settings value", () => {
    const eff = resolveMemorySettings(
      { memory: { plansDir: "docs/plans" } },
      { VANTA_PLANS_DIR: "   " },
    );
    expect(eff.plansDir).toBe("docs/plans");
  });
});

describe("isMemoryExcluded", () => {
  it("empty exclude list drops nothing (today's behavior)", () => {
    expect(isMemoryExcluded("Jason lives in Valencia", [])).toBe(false);
  });

  it("drops a capture matching an exclude pattern (case-insensitive)", () => {
    expect(isMemoryExcluded("the API_KEY is sk-123", ["api_key"])).toBe(true);
    expect(isMemoryExcluded("his password is hunter2", ["PASSWORD"])).toBe(true);
  });

  it("keeps a capture that matches no pattern", () => {
    expect(isMemoryExcluded("prefers ESM and TypeScript", ["secret", "token"])).toBe(false);
  });

  it("a blank pattern never matches", () => {
    expect(isMemoryExcluded("anything", ["", "   "])).toBe(false);
  });
});
