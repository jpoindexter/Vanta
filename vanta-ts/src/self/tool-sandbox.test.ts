import { describe, expect, it } from "vitest";
import { planToolSandboxTest } from "./tool-sandbox.js";

describe("planToolSandboxTest", () => {
  it("accepts a limb tool path and derives the co-located vitest command", () => {
    const plan = planToolSandboxTest({ toolPath: "vanta-ts/src/tools/web-fetch.ts" });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.toolPath).toBe("vanta-ts/src/tools/web-fetch.ts");
    expect(plan.command).toBe("npm --prefix vanta-ts test -- src/tools/web-fetch.test.ts");
  });

  it("uses an explicit command when provided", () => {
    const plan = planToolSandboxTest({
      toolPath: "vanta-ts/src/tools/web-fetch.ts",
      command: "npm --prefix vanta-ts test -- src/tools/web-fetch.test.ts",
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.command).toBe("npm --prefix vanta-ts test -- src/tools/web-fetch.test.ts");
  });

  it("rejects protected or non-tool paths", () => {
    expect(planToolSandboxTest({ toolPath: "src/safety.rs" }).ok).toBe(false);
    expect(planToolSandboxTest({ toolPath: "vanta-ts/src/agent.ts" }).ok).toBe(false);
    expect(planToolSandboxTest({ toolPath: "vanta-ts/src/world/store.ts" }).ok).toBe(false);
  });

  it("rejects path traversal before classification", () => {
    const plan = planToolSandboxTest({ toolPath: "vanta-ts/src/tools/../agent.ts" });

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toContain("repo-relative");
  });
});
