import { describe, it, expect } from "vitest";
import {
  SkillOverridesSchema,
  resolveSkillOverride,
  skillVisibleToModel,
  skillVisibleInMenu,
  filterModelSkills,
  type SkillOverrides,
} from "./overrides.js";

describe("SkillOverridesSchema", () => {
  it("accepts a per-skill map of the three flags", () => {
    const parsed = SkillOverridesSchema.safeParse({
      noisy: { hiddenFromModel: true },
      legacy: { disabled: true },
      "menu-clutter": { hiddenFromMenu: true },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty map and an empty per-skill override", () => {
    expect(SkillOverridesSchema.safeParse({}).success).toBe(true);
    expect(SkillOverridesSchema.safeParse({ s: {} }).success).toBe(true);
  });

  it("rejects unknown keys in a per-skill override (strict)", () => {
    const parsed = SkillOverridesSchema.safeParse({ s: { hidden: true } });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-boolean flag value", () => {
    const parsed = SkillOverridesSchema.safeParse({ s: { disabled: "yes" } });
    expect(parsed.success).toBe(false);
  });
});

describe("resolveSkillOverride", () => {
  it("returns the override for a skill that has one", () => {
    const overrides: SkillOverrides = { noisy: { hiddenFromModel: true } };
    expect(resolveSkillOverride("noisy", overrides)).toEqual({ hiddenFromModel: true });
  });

  it("returns an all-visible default for a skill with no override", () => {
    const overrides: SkillOverrides = { noisy: { hiddenFromModel: true } };
    expect(resolveSkillOverride("other", overrides)).toEqual({});
  });

  it("returns the default when the map is undefined", () => {
    expect(resolveSkillOverride("any", undefined)).toEqual({});
  });
});

describe("skillVisibleToModel / skillVisibleInMenu", () => {
  it("no override → visible to BOTH (default behavior)", () => {
    expect(skillVisibleToModel("fresh", undefined)).toBe(true);
    expect(skillVisibleInMenu("fresh", undefined)).toBe(true);
    expect(skillVisibleToModel("fresh", {})).toBe(true);
    expect(skillVisibleInMenu("fresh", {})).toBe(true);
  });

  it("disabled → visible to NEITHER the model NOR the menu", () => {
    const overrides: SkillOverrides = { old: { disabled: true } };
    expect(skillVisibleToModel("old", overrides)).toBe(false);
    expect(skillVisibleInMenu("old", overrides)).toBe(false);
  });

  it("hiddenFromModel → NOT in the model index but IN the menu", () => {
    const overrides: SkillOverrides = { noisy: { hiddenFromModel: true } };
    expect(skillVisibleToModel("noisy", overrides)).toBe(false);
    expect(skillVisibleInMenu("noisy", overrides)).toBe(true);
  });

  it("hiddenFromMenu → IN the model index but NOT in the menu", () => {
    const overrides: SkillOverrides = { clutter: { hiddenFromMenu: true } };
    expect(skillVisibleToModel("clutter", overrides)).toBe(true);
    expect(skillVisibleInMenu("clutter", overrides)).toBe(false);
  });

  it("disabled wins even when the narrower flags are absent", () => {
    const overrides: SkillOverrides = { dead: { disabled: true, hiddenFromMenu: false } };
    expect(skillVisibleToModel("dead", overrides)).toBe(false);
    expect(skillVisibleInMenu("dead", overrides)).toBe(false);
  });

  it("explicit false flags keep a skill visible (false is not true)", () => {
    const overrides: SkillOverrides = {
      s: { disabled: false, hiddenFromModel: false, hiddenFromMenu: false },
    };
    expect(skillVisibleToModel("s", overrides)).toBe(true);
    expect(skillVisibleInMenu("s", overrides)).toBe(true);
  });
});

describe("filterModelSkills", () => {
  it("drops disabled + hiddenFromModel, keeps the rest, preserves order", () => {
    const overrides: SkillOverrides = {
      a: { disabled: true },
      c: { hiddenFromModel: true },
      d: { hiddenFromMenu: true }, // menu-only hide → STILL visible to the model
    };
    const result = filterModelSkills(["a", "b", "c", "d"], overrides);
    expect(result).toEqual(["b", "d"]);
  });

  it("an undefined map returns the list unchanged (today's behavior)", () => {
    expect(filterModelSkills(["a", "b"], undefined)).toEqual(["a", "b"]);
  });

  it("an empty map returns the list unchanged", () => {
    expect(filterModelSkills(["a", "b"], {})).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const input = ["a", "b"];
    filterModelSkills(input, { a: { disabled: true } });
    expect(input).toEqual(["a", "b"]);
  });
});
