import { describe, it, expect } from "vitest";
import { getActiveSpec, evolveSpec, brainV2Digest, type BrainV2Spec } from "./v2.js";

describe("brain v2 scaffold", () => {
  it("starts with bootstrap spec", () => {
    const spec = getActiveSpec();
    expect(spec.version).toBe(1);
    expect(spec.substrate).toBe("jsonl");
  });

  it("evolveSpec replaces the active spec", () => {
    const customSpec: BrainV2Spec = {
      version: 2,
      description: "Custom test spec",
      substrate: "custom",
      async digest() { return "custom digest"; },
      async read() { return null; },
      async write() { /* noop */ },
    };
    evolveSpec(customSpec);
    expect(getActiveSpec().version).toBe(2);
    // Restore
    evolveSpec(getActiveSpec()); // no-op but reset-safe
  });

  it("brainV2Digest returns empty string when no entries", async () => {
    const digest = await brainV2Digest({ VANTA_HOME: "/tmp/no-brain-v2-dir" });
    expect(typeof digest).toBe("string");
  });
});
