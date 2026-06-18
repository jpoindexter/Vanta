import { describe, expect, it } from "vitest";
import { runMetaTuneInstructions } from "./loop.js";
import type { EvalReport } from "../eval/types.js";

function report(passAt1: number, outputTokens = 0): EvalReport {
  return { total: 1, passed: passAt1 === 100 ? 1 : 0, passAt1, outputTokens, results: [] };
}

describe("runMetaTuneInstructions", () => {
  it("records the best variant without adopting by default", async () => {
    const writes: string[] = [];
    const scores = [50, 60, 40];
    const record = await runMetaTuneInstructions({
      repoRoot: "/repo",
      opts: { iters: 2, corpus: "eval/tasks", blockPath: "PROGRAM.md", adopt: false },
      deps: {
        readProgram: () => "# Program\n",
        writeProgram: (_path, text) => { writes.push(text); },
        evalProgram: async () => report(scores.shift() ?? 0),
        record: () => {},
      },
    });
    expect(record.best?.iter).toBe(1);
    expect(record.adopted).toBe(false);
    expect(writes).toEqual([]);
  });

  it("requires approval before writing the winning program", async () => {
    let written = "";
    const record = await runMetaTuneInstructions({
      repoRoot: "/repo",
      opts: { iters: 1, corpus: "eval/tasks", blockPath: "PROGRAM.md", adopt: true },
      deps: {
        readProgram: () => "# Program\n",
        writeProgram: (_path, text) => { written = text; },
        evalProgram: async (program) => report(program.includes("Before claiming") ? 70 : 50),
        approve: async () => true,
        record: () => {},
      },
    });
    expect(record.adopted).toBe(true);
    expect(written).toContain("Before claiming completion");
  });
});
