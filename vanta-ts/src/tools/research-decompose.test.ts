import { describe, it, expect } from "vitest";
import {
  buildResearchDecomposeTool,
  type SubQueryRunner,
} from "./research-decompose.js";
import type { ToolContext } from "./types.js";

function ctx(): ToolContext {
  return {
    root: "/tmp/research-test",
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
  };
}

/** A fake parallel-runner: deterministic tools + findings per dimension, no real worker. */
const fakeRunner: SubQueryRunner = async (sub) => ({
  dimension: sub.dimension,
  query: sub.query,
  toolsUsed: ["web_search", `tool_for_${sub.dimension.replace(/\s+/g, "_")}`],
  findings: `found something about ${sub.dimension}`,
});

describe("research_decompose tool", () => {
  it("has a kernel-gated research describeForSafety", () => {
    const tool = buildResearchDecomposeTool(fakeRunner);
    expect(tool.schema.name).toBe("research_decompose");
    expect(tool.describeForSafety?.({ objective: "x" })).toBe(
      "decompose and run a parallel research query",
    );
  });

  it("fans out, runs each sub-query via the injected runner, and synthesizes", async () => {
    const runner: SubQueryRunner = async (sub) => fakeRunner(sub, ctx());
    const tool = buildResearchDecomposeTool(runner);
    const res = await tool.execute({ objective: "evaluate caching strategies" }, ctx());
    expect(res.ok).toBe(true);
    // Per-dimension tool transparency: each dimension shows its tools + findings.
    expect(res.output).toContain("## current state");
    expect(res.output).toContain("tools: web_search, tool_for_current_state");
    expect(res.output).toContain("found something about current state");
    // Union footer surfaces every tool that ran.
    expect(res.output).toContain("tools used across research:");
    expect(res.output).toContain("web_search");
  });

  it("runs the sub-queries in parallel (no shared sequential state)", async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    const runner: SubQueryRunner = async (sub) => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { dimension: sub.dimension, query: sub.query, toolsUsed: ["t"], findings: "f" };
    };
    const tool = buildResearchDecomposeTool(runner);
    await tool.execute({ objective: "research X", dimensions: 4 }, ctx());
    expect(maxConcurrent).toBeGreaterThan(1);
  });

  it("respects the dimensions fan-out cap", async () => {
    const seen: string[] = [];
    const runner: SubQueryRunner = async (sub) => {
      seen.push(sub.dimension);
      return { dimension: sub.dimension, query: sub.query, toolsUsed: [], findings: "" };
    };
    const tool = buildResearchDecomposeTool(runner);
    await tool.execute({ objective: "research Y", dimensions: 2 }, ctx());
    expect(seen.length).toBe(2);
  });

  it("rejects an empty objective as an error value (does not throw)", async () => {
    const tool = buildResearchDecomposeTool(fakeRunner);
    const res = await tool.execute({ objective: "   " }, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("objective");
  });

  it("rejects malformed args without throwing", async () => {
    const tool = buildResearchDecomposeTool(fakeRunner);
    const res = await tool.execute({} as Record<string, unknown>, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("objective string");
  });
});
