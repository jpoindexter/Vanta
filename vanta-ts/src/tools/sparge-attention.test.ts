import { describe, expect, it } from "vitest";
import { buildSpargeArgs, spargeAttentionTool } from "./sparge-attention.js";

describe("sparge_attention", () => {
  it("builds bounded benchmark arguments without a shell", () => {
    expect(buildSpargeArgs({
      action: "benchmark",
      batch: 2,
      heads: 16,
      sequence_length: 4096,
      head_dim: 128,
      topk: 0.5,
      causal: true,
      warmup: 3,
      iterations: 10,
    })).toEqual([
      "benchmark",
      "--batch", "2",
      "--heads", "16",
      "--sequence-length", "4096",
      "--head-dim", "128",
      "--topk", "0.5",
      "--warmup", "3",
      "--iterations", "10",
      "--json",
      "--causal",
    ]);
  });

  it("rejects a sequence length that violates the kernel block size", async () => {
    const result = await spargeAttentionTool.execute({
      action: "benchmark",
      sequence_length: 129,
    }, {} as never);
    expect(result).toEqual({
      ok: false,
      output: "sparge_attention: sequence_length must be divisible by 128",
    });
  });

  it("does not leak benchmark parameters into the safety description", () => {
    expect(spargeAttentionTool.describeForSafety?.({
      action: "benchmark",
      sequence_length: 4096,
    })).toBe("read-only SpargeAttention benchmark operation");
  });
});
