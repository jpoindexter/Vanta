import { describe, it, expect } from "vitest";
import { swarmTool } from "./swarm.js";
import { buildRegistry } from "./index.js";
import type { ToolContext } from "./types.js";

describe("swarmTool", () => {
  it("rejects missing tasks", async () => {
    const r = await swarmTool.execute({}, {} as ToolContext);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/tasks/);
  });
  it("safety label is constant", () => {
    expect(swarmTool.describeForSafety?.({ tasks: [{ goal: "x", instruction: "y" }] })).toBe("run a parallel swarm of worker agents");
  });
  it("is registered, and children exclude delegate/swarm (no recursion)", () => {
    const names = buildRegistry().schemas().map((s) => s.name);
    expect(names).toContain("swarm");
    const child = buildRegistry({ exclude: ["delegate", "swarm"] }).schemas().map((s) => s.name);
    expect(child).not.toContain("swarm");
    expect(child).not.toContain("delegate");
  });
});
