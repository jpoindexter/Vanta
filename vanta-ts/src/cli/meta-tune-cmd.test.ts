import { describe, expect, it } from "vitest";
import { runMetaTuneCommand } from "./meta-tune-cmd.js";
import type { EvalReport } from "../eval/types.js";

function report(passAt1: number): EvalReport {
  return { total: 1, passed: passAt1 === 100 ? 1 : 0, passAt1, outputTokens: 0, results: [] };
}

describe("runMetaTuneCommand", () => {
  it("runs the instruction tuner with injected eval deps", async () => {
    const lines: string[] = [];
    const code = await runMetaTuneCommand("/repo", ["instructions", "--iters", "1"], {
      log: (line) => { lines.push(line); },
      tuneDeps: {
        readProgram: () => "# Program\n",
        evalProgram: async (program) => report(program.includes("Before claiming") ? 60 : 50),
        record: () => {},
      },
    });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("best: iter 1");
  });

  it("prints usage for unsupported subcommands", async () => {
    const lines: string[] = [];
    const code = await runMetaTuneCommand("/repo", ["other"], { log: (line) => { lines.push(line); } });
    expect(code).toBe(1);
    expect(lines[0]).toContain("Usage:");
  });
});
