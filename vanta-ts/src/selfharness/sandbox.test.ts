import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  saveSandboxInput,
  loadSandboxInput,
  runSandbox,
  formatComparison,
  applyPromptPrefix,
  SandboxInputSchema,
  type SandboxRunner,
  type ConfigOverride,
  type Trace,
} from "./sandbox.js";

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "vanta-sandbox-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

/** A deterministic fake runner — no LLM, no network. Records every call and the
 *  override it received, and asserts (by construction) that git is never invoked. */
function fakeRunner(opts: { trace?: (override: ConfigOverride) => Trace } = {}): {
  runner: SandboxRunner;
  calls: Array<{ instruction: string; override: ConfigOverride }>;
  gitInvoked: boolean;
} {
  const calls: Array<{ instruction: string; override: ConfigOverride }> = [];
  const state = { gitInvoked: false };
  const runner: SandboxRunner = async ({ instruction, override }) => {
    calls.push({ instruction, override });
    const t = opts.trace?.(override) ?? {
      finalText: override.model ? `done with ${override.model}` : "done with default",
      toolCalls: override.toolNames ?? ["read_file", "shell_cmd"],
      stoppedReason: "done",
    };
    return t;
  };
  return {
    runner,
    calls,
    get gitInvoked() {
      return state.gitInvoked;
    },
  };
}

describe("saveSandboxInput / loadSandboxInput", () => {
  it("round-trips a saved input under .vanta-style inputs dir", async () => {
    const file = await saveSandboxInput(dataDir, { name: "bugfix", instruction: "fix the failing test" });
    expect(file).toContain(join("sandbox", "inputs", "bugfix.json"));
    const loaded = await loadSandboxInput(dataDir, "bugfix");
    expect(loaded).toEqual({ name: "bugfix", instruction: "fix the failing test" });
  });

  it("rejects a filename-unsafe name", () => {
    expect(() => SandboxInputSchema.parse({ name: "../escape", instruction: "x" })).toThrow();
  });

  it("loadSandboxInput throws a clear error when the input is missing", async () => {
    await expect(loadSandboxInput(dataDir, "nope")).rejects.toThrow(/no saved sandbox input "nope"/);
  });
});

describe("runSandbox", () => {
  it("runs candidate and baseline against a saved input and reports a comparable trace", async () => {
    const input = await loadSandboxInput(dataDir, "seed").catch(async () => {
      await saveSandboxInput(dataDir, { name: "seed", instruction: "summarize the repo" });
      return loadSandboxInput(dataDir, "seed");
    });
    const fake = fakeRunner();
    const cmp = await runSandbox({
      input,
      override: { model: "gpt-candidate", promptPrefix: "Be terse." },
      deps: { runner: fake.runner },
    });
    // Both runs happened, against the SAME saved instruction.
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0]?.instruction).toBe("summarize the repo");
    expect(fake.calls[1]?.instruction).toBe("summarize the repo");
    // Candidate carried the override; baseline got the default (empty) config.
    expect(fake.calls[0]?.override.model).toBe("gpt-candidate");
    expect(fake.calls[1]?.override).toEqual({});
    // A comparable trace was captured for each run.
    expect(cmp.candidate.finalText).toBe("done with gpt-candidate");
    expect(cmp.baseline.finalText).toBe("done with default");
    expect(cmp.candidate.toolCalls.length).toBeGreaterThan(0);
    expect(cmp.candidate.stoppedReason).toBe("done");
  });

  it("computes the diff (tool-call delta + same-outcome) between the two runs", async () => {
    await saveSandboxInput(dataDir, { name: "d", instruction: "do a thing" });
    const input = await loadSandboxInput(dataDir, "d");
    const fake = fakeRunner({
      trace: (o) =>
        o.toolNames
          ? { finalText: "same", toolCalls: o.toolNames, stoppedReason: "done" }
          : { finalText: "same", toolCalls: ["a", "b", "c"], stoppedReason: "done" },
    });
    const cmp = await runSandbox({
      input,
      override: { toolNames: ["read_file"] },
      deps: { runner: fake.runner },
    });
    expect(cmp.diff.toolCallsDelta).toBe(1 - 3); // candidate(1) - baseline(3)
    expect(cmp.diff.sameOutcome).toBe(true);
  });

  it("honors a custom baseline override instead of default config", async () => {
    await saveSandboxInput(dataDir, { name: "b", instruction: "go" });
    const input = await loadSandboxInput(dataDir, "b");
    const fake = fakeRunner();
    await runSandbox({
      input,
      override: { model: "candidate" },
      baseline: { model: "baseline-model" },
      deps: { runner: fake.runner },
    });
    expect(fake.calls[1]?.override.model).toBe("baseline-model");
  });

  it("makes no git mutation — the sandbox never invokes git and creates no .git dir", async () => {
    await saveSandboxInput(dataDir, { name: "g", instruction: "anything" });
    const input = await loadSandboxInput(dataDir, "g");
    const fake = fakeRunner();
    await runSandbox({ input, override: {}, deps: { runner: fake.runner } });
    // The injected runner is the only side-effecting dep; it never touches git.
    expect(fake.gitInvoked).toBe(false);
    // The sandbox writes only its inputs JSON — no repo/.git under the data dir.
    await expect(stat(join(dataDir, ".git"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("override application", () => {
  it("applyPromptPrefix prepends the prefix, and is a no-op when absent", () => {
    expect(applyPromptPrefix("task", "PREFIX")).toBe("PREFIX\n\ntask");
    expect(applyPromptPrefix("task")).toBe("task");
  });
});

describe("formatComparison", () => {
  it("renders a readable side-by-side block naming both runs and the diff", async () => {
    await saveSandboxInput(dataDir, { name: "fmt", instruction: "x" });
    const input = await loadSandboxInput(dataDir, "fmt");
    const fake = fakeRunner();
    const override = { model: "gpt-candidate", toolNames: ["read_file"] };
    const cmp = await runSandbox({ input, override, deps: { runner: fake.runner } });
    const text = formatComparison(cmp, override);
    expect(text).toContain("CANDIDATE");
    expect(text).toContain("BASELINE");
    expect(text).toContain("model=gpt-candidate");
    expect(text).toContain("default config");
    expect(text).toContain("no git mutation");
    expect(text).toMatch(/diff: tool-calls/);
  });
});
