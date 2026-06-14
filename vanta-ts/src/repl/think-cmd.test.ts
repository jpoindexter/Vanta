import { describe, it, expect } from "vitest";
import { ultrathink, ultracode, deepResearch } from "./think-cmd.js";
import type { ReplCtx } from "./types.js";

const ctx = {} as ReplCtx; // these handlers ignore ctx

describe("deep-thinking skills", () => {
  it("ultrathink wraps the task with a deep-reasoning methodology and re-runs it", async () => {
    const r = await ultrathink("refactor the auth flow", ctx);
    expect(r.output).toContain("ultrathink");
    expect(r.resend).toContain("maximum reasoning depth");
    expect(r.resend).toContain("step-by-step plan");
    expect(r.resend).toContain("refactor the auth flow"); // the task is carried
  });

  it("ultracode injects a multi-agent coding orchestration directive", async () => {
    const r = await ultracode("migrate the API to v2", ctx);
    expect(r.resend).toContain("multi-agent coding push");
    expect(r.resend).toContain("delegate/swarm");
    expect(r.resend).toContain("migrate the API to v2");
  });

  it("deep-research injects a fan-out + skeptic-verify + cite directive", async () => {
    const r = await deepResearch("what is the state of the art in agent harnesses", ctx);
    expect(r.resend).toContain("multi-source research");
    expect(r.resend).toContain("web_search");
    expect(r.resend).toContain("verify key claims");
    expect(r.resend).toContain("agent harnesses");
  });

  it("each shows usage and no resend when given no task", async () => {
    for (const [h, name] of [[ultrathink, "ultrathink"], [ultracode, "ultracode"], [deepResearch, "deep-research"]] as const) {
      const r = await h("   ", ctx);
      expect(r.output).toContain(`usage: /${name}`);
      expect(r.resend).toBeUndefined();
    }
  });
});
