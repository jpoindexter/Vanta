import { describe, it, expect } from "vitest";
import { buildRunPipelineTool, measureSavings } from "./run-pipeline.js";
import { InMemoryToolRegistry } from "./registry.js";
import type { Tool, ToolContext } from "./types.js";
import type { Risk } from "../types.js";

function fakeTool(name: string, run: (args: Record<string, unknown>) => { ok: boolean; output: string }): Tool {
  return {
    schema: { name, description: name, parameters: { type: "object", properties: {} } },
    describeForSafety: () => name,
    execute: async (args) => run(args),
  };
}

function ctxWith(risk: Risk, approve = true): { ctx: ToolContext; approvals: string[] } {
  const approvals: string[] = [];
  const ctx: ToolContext = {
    root: "/tmp",
    safety: { assess: async () => ({ risk }) } as unknown as ToolContext["safety"],
    requestApproval: async (action) => { approvals.push(action); return approve; },
  };
  return { ctx, approvals };
}

// A representative fetch→transform→write registry: read emits a big blob, transform
// shrinks it, write emits a short final result.
function pipelineRegistry(): InMemoryToolRegistry {
  const reg = new InMemoryToolRegistry();
  reg.register(fakeTool("read", () => ({ ok: true, output: "X".repeat(4000) })));
  reg.register(fakeTool("transform", (a) => ({ ok: true, output: `cleaned(${String(a.in).length})` })));
  reg.register(fakeTool("write", (a) => ({ ok: true, output: `wrote ${String(a.content)}` })));
  return reg;
}

const READ_TRANSFORM_WRITE = {
  steps: [
    { tool: "read", args: {}, assignTo: "raw" },
    { tool: "transform", args: { in: "$raw" }, assignTo: "clean" },
    { tool: "write", args: { content: "{{clean}}" } },
  ],
};

describe("measureSavings", () => {
  it("counts intermediate (non-final) bound outputs as saved context", () => {
    const m = measureSavings({ raw: "X".repeat(4000), clean: "cleaned(4000)" }, "wrote cleaned(4000)", 3);
    expect(m.stepCount).toBe(3);
    expect(m.intermediateCount).toBe(2);
    expect(m.savedChars).toBe(4000 + "cleaned(4000)".length);
    expect(m.savedTokens).toBe(Math.ceil(m.savedChars / 4));
    expect(m.note).toContain("3 step(s)");
  });
  it("does not count a binding equal to the final output", () => {
    const m = measureSavings({ a: "same", b: "other" }, "same", 2);
    expect(m.intermediateCount).toBe(1); // only "other" is saved
    expect(m.savedChars).toBe("other".length);
  });
});

describe("run_pipeline tool — end to end", () => {
  it("runs fetch→transform→write and returns ONLY the final result + savings", async () => {
    const tool = buildRunPipelineTool(pipelineRegistry());
    const { ctx } = ctxWith("allow");
    const res = await tool.execute(READ_TRANSFORM_WRITE, ctx);
    expect(res.ok).toBe(true);
    // transform saw the 4000-char raw via $raw; write got the cleaned binding.
    expect(res.output).toContain("wrote cleaned(4000)");
    expect(res.output).not.toContain("XXXX"); // the 4000-char blob never returns to the model
    expect(res.output).toContain("intermediate output(s)"); // savings reported
  });

  it("describeForSafety lists the tools so the kernel can gate the whole pipeline", () => {
    const tool = buildRunPipelineTool(pipelineRegistry());
    expect(tool.describeForSafety?.(READ_TRANSFORM_WRITE)).toBe("run a 3-step tool pipeline: read → transform → write");
  });
});

describe("run_pipeline — every step is kernel-gated", () => {
  it("a BLOCK verdict on a step stops the pipeline", async () => {
    const tool = buildRunPipelineTool(pipelineRegistry());
    const { ctx } = ctxWith("block");
    const res = await tool.execute(READ_TRANSFORM_WRITE, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toMatch(/step 1 failed/);
    expect(res.output).toMatch(/blocked/);
  });
  it("an ASK verdict prompts; a denial stops the pipeline", async () => {
    const tool = buildRunPipelineTool(pipelineRegistry());
    const { ctx, approvals } = ctxWith("ask", false);
    const res = await tool.execute(READ_TRANSFORM_WRITE, ctx);
    expect(approvals.length).toBeGreaterThan(0); // it asked
    expect(res.ok).toBe(false);
    expect(res.output).toMatch(/denied/);
  });
  it("an ASK verdict that is approved lets the pipeline run", async () => {
    const tool = buildRunPipelineTool(pipelineRegistry());
    const { ctx, approvals } = ctxWith("ask", true);
    const res = await tool.execute(READ_TRANSFORM_WRITE, ctx);
    expect(res.ok).toBe(true);
    expect(approvals.length).toBe(3); // one approval per step
  });
  it("an unknown tool fails cleanly", async () => {
    const tool = buildRunPipelineTool(pipelineRegistry());
    const { ctx } = ctxWith("allow");
    const res = await tool.execute({ steps: [{ tool: "nope", args: {} }] }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toMatch(/unknown tool: nope/);
  });
});

describe("run_pipeline — registered as a first-class tool", () => {
  it("is in the live registry built by buildRegistry", async () => {
    const { buildRegistry } = await import("./index.js");
    expect(buildRegistry().get("run_pipeline")).toBeDefined();
  });
});
