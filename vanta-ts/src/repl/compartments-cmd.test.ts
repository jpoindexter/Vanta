import { describe, it, expect } from "vitest";
import { formatCompartments } from "./compartments-cmd.js";
import { compartments } from "./compartments-cmd.js";
import { compartmentMap } from "../self/compartments.js";

describe("formatCompartments", () => {
  it("includes all 5 compartment names", () => {
    const out = formatCompartments(compartmentMap());
    expect(out).toContain("brainstem");
    expect(out).toContain("skeleton");
    expect(out).toContain("reflexes");
    expect(out).toContain("memory");
    expect(out).toContain("limbs");
  });

  it("includes a no-self-edit note for brainstem + skeleton", () => {
    const out = formatCompartments(compartmentMap());
    expect(out).toContain("never self-edited");
  });

  it("shows autonomy levels", () => {
    const out = formatCompartments(compartmentMap());
    expect(out).toContain("none");
    expect(out).toContain("review");
    expect(out).toContain("auto");
  });
});

describe("compartments handler", () => {
  it("with no arg returns the full map", async () => {
    const result = await compartments("", {} as never);
    expect(result.output).toBeDefined();
    expect(result.output).toContain("brainstem");
    expect(result.output).toContain("limbs");
    expect(result.output).toContain("never self-edited");
  });

  it("with a whitespace-only arg returns the full map", async () => {
    const result = await compartments("   ", {} as never);
    expect(result.output).toContain("skeleton");
  });

  it("with a path arg classifies that path", async () => {
    const result = await compartments("src/safety.rs", {} as never);
    expect(result.output).toContain("brainstem");
    expect(result.output).toContain("none");
  });

  it("classifies a factory path via the handler", async () => {
    const result = await compartments("vanta-ts/src/factory/core.ts", {} as never);
    expect(result.output).toContain("skeleton");
  });

  it("classifies a tool path as limbs via the handler", async () => {
    const result = await compartments("vanta-ts/src/tools/web-fetch.ts", {} as never);
    expect(result.output).toContain("limbs");
  });
});
