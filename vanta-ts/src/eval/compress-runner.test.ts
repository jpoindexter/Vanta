import { describe, it, expect } from "vitest";
import { withEnv, scopeRunnerToEnv } from "./compress-runner.js";

describe("withEnv", () => {
  it("applies an overlay during fn and restores prior values after", async () => {
    const env: NodeJS.ProcessEnv = { VANTA_COMPRESS: "1" };
    let seen: string | undefined;
    await withEnv({ VANTA_COMPRESS: "0", VANTA_SKILL_SUBSET: "0" }, async () => {
      seen = env.VANTA_COMPRESS;
      expect(env.VANTA_SKILL_SUBSET).toBe("0");
    }, env);
    expect(seen).toBe("0");
    expect(env.VANTA_COMPRESS).toBe("1"); // restored
    expect(env.VANTA_SKILL_SUBSET).toBeUndefined(); // deleted (was absent)
  });

  it("restores even when fn throws", async () => {
    const env: NodeJS.ProcessEnv = {};
    await expect(withEnv({ VANTA_SKILL_DISTILLED: "1" }, async () => { throw new Error("boom"); }, env)).rejects.toThrow("boom");
    expect(env.VANTA_SKILL_DISTILLED).toBeUndefined();
  });
});

describe("scopeRunnerToEnv", () => {
  it("runs the base runner under the overlay it was scoped with", async () => {
    const env: NodeJS.ProcessEnv = {};
    let envDuringRun: string | undefined;
    const base = async () => { envDuringRun = env.VANTA_COMPRESS; return { outputTokens: 5 }; };
    const factory = scopeRunnerToEnv(base, env);
    const runner = factory({ VANTA_COMPRESS: "1" });
    const out = await runner("instr", "/root");
    expect(out.outputTokens).toBe(5);
    expect(envDuringRun).toBe("1");
    expect(env.VANTA_COMPRESS).toBeUndefined(); // restored after
  });
});
