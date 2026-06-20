import { describe, it, expect } from "vitest";
import {
  resolveParallelCap,
  isConcurrencySafeTool,
  planToolExecution,
  reassembleResults,
  DEFAULT_PARALLEL_CAP,
  MAX_PARALLEL_CAP,
  type ExecGroup,
} from "./parallel-tools.js";
import { CONCURRENCY_SAFE_TOOLS } from "./stream-dispatch.js";
import type { ToolCall } from "../types.js";

const call = (id: string, name: string): ToolCall => ({ id, name, arguments: {} });

// A representative safe read + a representative mutating call from the real sets.
const SAFE = "read_file";
const MUT = "write_file";

describe("resolveParallelCap", () => {
  it("defaults to 1 (sequential) when unset", () => {
    expect(resolveParallelCap({})).toBe(DEFAULT_PARALLEL_CAP);
    expect(DEFAULT_PARALLEL_CAP).toBe(1);
  });

  it("defaults to 1 when empty / blank", () => {
    expect(resolveParallelCap({ VANTA_PARALLEL_TOOLS: "" })).toBe(1);
    expect(resolveParallelCap({ VANTA_PARALLEL_TOOLS: "   " })).toBe(1);
  });

  it("reads the override", () => {
    expect(resolveParallelCap({ VANTA_PARALLEL_TOOLS: "4" })).toBe(4);
  });

  it("clamps to the MAX ceiling", () => {
    expect(resolveParallelCap({ VANTA_PARALLEL_TOOLS: "999" })).toBe(MAX_PARALLEL_CAP);
    expect(MAX_PARALLEL_CAP).toBe(8);
  });

  it("clamps sub-1 / negative / zero up to 1", () => {
    expect(resolveParallelCap({ VANTA_PARALLEL_TOOLS: "0" })).toBe(1);
    expect(resolveParallelCap({ VANTA_PARALLEL_TOOLS: "-3" })).toBe(1);
  });

  it("floors fractional and ignores unparseable", () => {
    expect(resolveParallelCap({ VANTA_PARALLEL_TOOLS: "3.9" })).toBe(3);
    expect(resolveParallelCap({ VANTA_PARALLEL_TOOLS: "abc" })).toBe(1);
    expect(resolveParallelCap({ VANTA_PARALLEL_TOOLS: "NaN" })).toBe(1);
  });
});

describe("isConcurrencySafeTool", () => {
  it("reuses the shared CONCURRENCY_SAFE_TOOLS allowlist", () => {
    expect(isConcurrencySafeTool("read_file")).toBe(true);
    expect(isConcurrencySafeTool("grep_files")).toBe(true);
    expect(isConcurrencySafeTool("write_file")).toBe(false);
    expect(isConcurrencySafeTool("shell_cmd")).toBe(false);
    // every member of the real set is reported safe
    for (const name of CONCURRENCY_SAFE_TOOLS) expect(isConcurrencySafeTool(name)).toBe(true);
  });
});

describe("planToolExecution — cap 1 (current sequential behavior)", () => {
  it("makes every call its own sequential group, regardless of safety", () => {
    const a = call("a", SAFE), b = call("b", SAFE), c = call("c", MUT), d = call("d", SAFE);
    const groups = planToolExecution([a, b, c, d], 1);
    expect(groups).toEqual<ExecGroup[]>([
      { parallel: false, calls: [a] },
      { parallel: false, calls: [b] },
      { parallel: false, calls: [c] },
      { parallel: false, calls: [d] },
    ]);
    // no group is ever marked parallel at cap 1 = byte-identical sequential order
    expect(groups.every((g) => !g.parallel)).toBe(true);
  });

  it("treats cap 0 / negative like cap 1", () => {
    const calls = [call("a", SAFE), call("b", SAFE)];
    expect(planToolExecution(calls, 0)).toEqual(planToolExecution(calls, 1));
    expect(planToolExecution(calls, -5)).toEqual(planToolExecution(calls, 1));
  });

  it("preserves exact original order in the flattened call list", () => {
    const calls = [call("a", SAFE), call("b", MUT), call("c", SAFE)];
    const flat = planToolExecution(calls, 1).flatMap((g) => g.calls);
    expect(flat.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});

describe("planToolExecution — cap N (batch consecutive safe reads)", () => {
  it("batches consecutive safe reads up to the cap", () => {
    const calls = [call("a", SAFE), call("b", SAFE), call("c", SAFE)];
    const groups = planToolExecution(calls, 3);
    expect(groups).toEqual<ExecGroup[]>([{ parallel: true, calls }]);
  });

  it("splits a safe run that exceeds the cap into multiple batches", () => {
    const a = call("a", SAFE), b = call("b", SAFE), c = call("c", SAFE), d = call("d", SAFE), e = call("e", SAFE);
    const groups = planToolExecution([a, b, c, d, e], 2);
    expect(groups).toEqual<ExecGroup[]>([
      { parallel: true, calls: [a, b] },
      { parallel: true, calls: [c, d] },
      { parallel: false, calls: [e] }, // trailing solo safe = sequential group
    ]);
  });

  it("breaks the batch on a mutating call and keeps it solo + ordered", () => {
    const a = call("a", SAFE), b = call("b", SAFE), c = call("c", MUT), d = call("d", SAFE), e = call("e", SAFE);
    const groups = planToolExecution([a, b, c, d, e], 4);
    expect(groups).toEqual<ExecGroup[]>([
      { parallel: true, calls: [a, b] },
      { parallel: false, calls: [c] }, // mutating, solo
      { parallel: true, calls: [d, e] },
    ]);
  });

  it("a lone safe call is a sequential (non-parallel) group, not a 1-batch", () => {
    const a = call("a", SAFE), b = call("b", MUT);
    const groups = planToolExecution([a, b], 4);
    expect(groups).toEqual<ExecGroup[]>([
      { parallel: false, calls: [a] },
      { parallel: false, calls: [b] },
    ]);
  });

  it("never reorders: flattened groups always equal the original call order", () => {
    const calls = [call("a", SAFE), call("b", MUT), call("c", SAFE), call("d", SAFE), call("e", MUT), call("f", SAFE)];
    for (const cap of [1, 2, 3, 8]) {
      const flat = planToolExecution(calls, cap).flatMap((g) => g.calls);
      expect(flat.map((c) => c.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
    }
  });

  it("handles an empty call list", () => {
    expect(planToolExecution([], 4)).toEqual([]);
  });
});

describe("reassembleResults — restores original call order", () => {
  it("flattens index-aligned group results in group order", () => {
    const calls = [call("a", SAFE), call("b", SAFE), call("c", MUT), call("d", SAFE)];
    const groups = planToolExecution(calls, 2);
    // simulate each group resolving to outputs in its own call order
    const groupResults = groups.map((g) => g.calls.map((c) => `out:${c.id}`));
    expect(reassembleResults(groups, groupResults)).toEqual(["out:a", "out:b", "out:c", "out:d"]);
  });

  it("a parallel batch that resolves still reassembles in call order", () => {
    const calls = [call("a", SAFE), call("b", SAFE), call("c", SAFE)];
    const groups = planToolExecution(calls, 3);
    // even if the batch were awaited concurrently, the caller keeps per-call order
    const groupResults = [["A", "B", "C"]];
    expect(reassembleResults(groups, groupResults)).toEqual(["A", "B", "C"]);
  });

  it("plan + reassemble round-trips to the original order for any cap", () => {
    const calls = [call("a", SAFE), call("b", MUT), call("c", SAFE), call("d", SAFE), call("e", SAFE), call("f", MUT)];
    for (const cap of [1, 2, 3, 8]) {
      const groups = planToolExecution(calls, cap);
      const groupResults = groups.map((g) => g.calls.map((c) => c.id));
      expect(reassembleResults(groups, groupResults)).toEqual(["a", "b", "c", "d", "e", "f"]);
    }
  });

  it("tolerates a missing group-results entry (empty slot → skipped)", () => {
    const calls = [call("a", SAFE), call("b", MUT)];
    const groups = planToolExecution(calls, 1);
    // groupResults[1] absent → reassembly skips it without throwing
    expect(reassembleResults(groups, [["only-a"]])).toEqual(["only-a"]);
  });
});
