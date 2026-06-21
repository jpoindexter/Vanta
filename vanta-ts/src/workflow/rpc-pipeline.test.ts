import { describe, expect, it } from "vitest";
import {
  parsePipeline,
  pipelineContextCost,
  runPipeline,
  substituteRefs,
  UNBOUND_MARKER,
  type Pipeline,
  type PipelineRunDeps,
  type ToolResultLike,
} from "./rpc-pipeline.js";

function ok(output: string): ToolResultLike {
  return { ok: true, output };
}

/** Records every (tool, args) call so tests can assert sequencing + substitution. */
function recordingDeps(handler: (tool: string, args: Record<string, unknown>) => ToolResultLike): {
  deps: PipelineRunDeps;
  calls: Array<{ tool: string; args: Record<string, unknown> }>;
} {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const deps: PipelineRunDeps = {
    async callTool(tool, args) {
      calls.push({ tool, args });
      return handler(tool, args);
    },
  };
  return { deps, calls };
}

describe("parsePipeline", () => {
  it("accepts a valid pipeline", () => {
    const res = parsePipeline({ steps: [{ tool: "read_file", args: { path: "a.ts" } }] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.pipeline.steps).toHaveLength(1);
  });

  it("defaults missing args to an empty object", () => {
    const res = parsePipeline({ steps: [{ tool: "inspect_state" }] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.pipeline.steps[0]?.args).toEqual({});
  });

  it("rejects an empty steps array", () => {
    const res = parsePipeline({ steps: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/steps/);
  });

  it("rejects a duplicate assignTo name", () => {
    const res = parsePipeline({
      steps: [
        { tool: "a", args: {}, assignTo: "x" },
        { tool: "b", args: {}, assignTo: "x" },
      ],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/duplicate assignTo name: x/);
  });

  it("rejects a step with a missing tool name (errors-as-values, no throw)", () => {
    const res = parsePipeline({ steps: [{ args: {} }] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/tool/);
  });

  it("rejects non-object input without throwing", () => {
    expect(parsePipeline(null).ok).toBe(false);
    expect(parsePipeline("nope").ok).toBe(false);
  });
});

describe("substituteRefs", () => {
  it("replaces a $name placeholder with the bound value", () => {
    const out = substituteRefs({ path: "$file" }, { file: "src/x.ts" });
    expect(out).toEqual({ path: "src/x.ts" });
  });

  it("replaces a {{name}} placeholder with the bound value", () => {
    const out = substituteRefs({ path: "{{file}}" }, { file: "src/x.ts" });
    expect(out).toEqual({ path: "src/x.ts" });
  });

  it("interpolates {{name}} inside a larger string", () => {
    const out = substituteRefs({ msg: "found in {{file}} today" }, { file: "x.ts" });
    expect(out).toEqual({ msg: "found in x.ts today" });
  });

  it("marks an unbound ref instead of silently emptying it", () => {
    const out = substituteRefs({ path: "$missing" }, {});
    expect(out.path).toBe(`${UNBOUND_MARKER}missing>`);
  });

  it("leaves args without refs unchanged", () => {
    const out = substituteRefs({ path: "literal.ts", n: 3, flag: true }, { x: "y" });
    expect(out).toEqual({ path: "literal.ts", n: 3, flag: true });
  });

  it("leaves non-string values untouched", () => {
    const out = substituteRefs({ n: 5, list: [1, 2], obj: { a: 1 } }, { n: "X" });
    expect(out).toEqual({ n: 5, list: [1, 2], obj: { a: 1 } });
  });
});

describe("runPipeline", () => {
  it("runs steps in order and returns ONLY the final result", async () => {
    const pipeline: Pipeline = {
      steps: [
        { tool: "first", args: {}, assignTo: "a" },
        { tool: "second", args: {}, assignTo: "b" },
        { tool: "third", args: {} },
      ],
    };
    const { deps, calls } = recordingDeps((tool) => ok(`${tool}-out`));
    const res = await runPipeline(pipeline, deps);

    expect(calls.map((c) => c.tool)).toEqual(["first", "second", "third"]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.output).toBe("third-out");
      // intermediate outputs stay in bindings, never in `result`
      expect(res.bindings).toEqual({ a: "first-out", b: "second-out" });
    }
  });

  it("threads a step's assignTo result into the next step's args", async () => {
    const pipeline: Pipeline = {
      steps: [
        { tool: "locate", args: {}, assignTo: "path" },
        { tool: "read", args: { file: "$path" } },
      ],
    };
    const { deps, calls } = recordingDeps((tool) => (tool === "locate" ? ok("src/found.ts") : ok("contents")));
    const res = await runPipeline(pipeline, deps);

    expect(calls[1]?.args).toEqual({ file: "src/found.ts" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.result.output).toBe("contents");
  });

  it("STOPS the chain on a tool error and returns failedStep", async () => {
    const pipeline: Pipeline = {
      steps: [
        { tool: "ok-step", args: {}, assignTo: "a" },
        { tool: "bad-step", args: {} },
        { tool: "never-runs", args: {} },
      ],
    };
    const { deps, calls } = recordingDeps((tool) =>
      tool === "bad-step" ? { ok: false, output: "boom" } : ok(`${tool}-out`),
    );
    const res = await runPipeline(pipeline, deps);

    expect(calls.map((c) => c.tool)).toEqual(["ok-step", "bad-step"]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.failedStep).toBe(1);
      expect(res.error).toBe("boom");
    }
  });

  it("STOPS with a clear error when a step references an unbound name", async () => {
    const pipeline: Pipeline = {
      steps: [{ tool: "read", args: { file: "$undeclared" } }],
    };
    const { deps, calls } = recordingDeps(() => ok("x"));
    const res = await runPipeline(pipeline, deps);

    expect(calls).toHaveLength(0); // never calls the tool with a bad ref
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.failedStep).toBe(0);
      expect(res.error).toMatch(/unbound name: undeclared/);
    }
  });

  it("returns failedStep when callTool throws (errors-as-values, never throws)", async () => {
    const pipeline: Pipeline = { steps: [{ tool: "explode", args: {} }] };
    const deps: PipelineRunDeps = {
      async callTool() {
        throw new Error("network down");
      },
    };
    const res = await runPipeline(pipeline, deps);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.failedStep).toBe(0);
      expect(res.error).toBe("network down");
    }
  });

  it("works end-to-end from a parsed spec", async () => {
    const parsed = parsePipeline({
      steps: [
        { tool: "grep", args: { q: "TODO" }, assignTo: "hit" },
        { tool: "summarize", args: { text: "{{hit}}" } },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { deps, calls } = recordingDeps((tool) => (tool === "grep" ? ok("3 hits") : ok("done")));
    const res = await runPipeline(parsed.pipeline, deps);
    expect(calls[1]?.args).toEqual({ text: "3 hits" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.result.output).toBe("done");
  });
});

describe("pipelineContextCost", () => {
  it("notes that only the final result returns to the model", () => {
    const note = pipelineContextCost({
      steps: [
        { tool: "a", args: {} },
        { tool: "b", args: {} },
        { tool: "c", args: {} },
      ],
    });
    expect(note).toMatch(/3 step/);
    expect(note).toMatch(/2 intermediate/);
    expect(note).toMatch(/zero LLM context cost/);
  });

  it("reports zero intermediate outputs for a single-step pipeline", () => {
    const note = pipelineContextCost({ steps: [{ tool: "a", args: {} }] });
    expect(note).toMatch(/0 intermediate/);
  });
});
