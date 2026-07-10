import { describe, expect, it } from "vitest";
import { runTrajectoryCommand } from "./trajectory-cmd.js";
import type { TrajectoryExport } from "../training/export.js";

function exported(examples: number): TrajectoryExport {
  return {
    outDir: "/tmp/out",
    trajectoriesPath: "/tmp/out/trajectories.jsonl",
    loraPath: "/tmp/out/lora-sft.jsonl",
    manifestPath: "/tmp/out/manifest.json",
    batch: {
      examples: [], sft: [],
      stats: { sessions: examples ? 1 : 0, examples, toolCalls: 4, toolResults: 4, compressedResults: 2, tokensBefore: 100, tokensAfter: 60 },
    },
  };
}

describe("runTrajectoryCommand", () => {
  it("exports a tools-only batch and reports compression", async () => {
    const lines: string[] = [];
    let toolsOnly = false;
    const code = await runTrajectoryCommand(["export", "--tools-only", "--limit", "3", "--out", "/tmp/out"], {
      log: (line) => lines.push(line),
      sessions: async () => [],
      exportBatch: async (_sessions, _out, limit, onlyTools) => { expect(limit).toBe(3); toolsOnly = onlyTools; return exported(3); },
    });
    expect(code).toBe(0);
    expect(toolsOnly).toBe(true);
    expect(lines.join("\n")).toContain("100→60");
  });

  it("fails clearly when no complete trajectories exist", async () => {
    const code = await runTrajectoryCommand(["export"], {
      log: () => {}, sessions: async () => [], exportBatch: async () => exported(0),
    });
    expect(code).toBe(1);
  });

  it("feeds a dataset into the LoRA train path", async () => {
    const lines: string[] = [];
    let seenPath = "";
    const code = await runTrajectoryCommand(["train", "/tmp/lora.jsonl", "--steps", "2", "--out", "/tmp/adapter"], {
      log: (line) => lines.push(line),
      train: async (path, opts) => {
        seenPath = path;
        expect(opts).toMatchObject({ steps: 2, maxLength: 2048, outputDir: "/tmp/adapter" });
        return {
          ok: true,
          readiness: { ready: true, usablePairs: 3, reason: "ready" },
          result: { ok: true, device: "mps", examples: 3, trainableLoraParams: 4096, lossFirst: 5, lossLast: 4, lossDecreased: true, adapterSaved: true, adapterDir: "/tmp/adapter" },
        };
      },
    });
    expect(code).toBe(0);
    expect(seenPath).toBe("/tmp/lora.jsonl");
    expect(lines.join("\n")).toContain("4096 trainable params");
  });
});
