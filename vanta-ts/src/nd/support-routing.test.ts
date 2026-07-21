import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executiveFunctionTier } from "../prompt.js";
import { support } from "../repl/nd-cmd.js";
import { invalidateNdConfig, loadPromptNdPreferences } from "./profile.js";
import type { ReplCtx } from "../repl/types.js";

describe("current support state — command to prompt", () => {
  it("routes explicit low-capacity, high-load, stuck work without diagnosis inference", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-support-routing-"));
    const env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
    const ctx = { env } as ReplCtx;

    try {
      await support("capacity low", ctx);
      await support("load high", ctx);
      await support("activation stuck", ctx);
      const prefs = await loadPromptNdPreferences(env);
      const tier = executiveFunctionTier(prefs);

      expect(tier).toContain("Capacity is low");
      expect(tier).toContain("Memory load is high");
      expect(tier).toContain("Activation support is on");
      expect(tier).toContain("never diagnosis");
      expect(tier).not.toMatch(/Jason|is autistic|has ADHD/i);
    } finally {
      invalidateNdConfig();
      await rm(home, { recursive: true, force: true });
    }
  });
});
