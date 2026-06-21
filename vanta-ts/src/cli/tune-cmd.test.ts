import { describe, it, expect } from "vitest";
import { runTuneCommand } from "./tune-cmd.js";
import type { PreferenceSignal } from "../preferences/signals.js";
import type { RunLoraTrainOutcome } from "../meta-tune/lora-train.js";

// Minimal mock signal — runTuneCommand only reads context/chosen.value/rejected.value
// via signalToRow; the rest is validated at real read-time (which we mock).
function mockSignal(i: number): PreferenceSignal {
  return {
    context: `question ${i}`,
    chosen: { label: "good", value: `preferred answer ${i}` },
    rejected: { label: "bad", value: `worse answer ${i}` },
  } as unknown as PreferenceSignal;
}

const okOutcome: RunLoraTrainOutcome = {
  ok: true,
  readiness: { usablePairs: 25, ready: true, reason: "ok" },
  result: {
    ok: true,
    device: "mps",
    examples: 25,
    trainableLoraParams: 2048,
    lossFirst: 5,
    lossLast: 4,
    lossDecreased: true,
    adapterSaved: true,
    adapterDir: "/tmp/adapter",
  },
};

describe("runTuneCommand", () => {
  it("a non-lora subcommand → usage + exit 1", async () => {
    const lines: string[] = [];
    const code = await runTuneCommand("/r", ["bogus"], { log: (l) => lines.push(l), readSignals: async () => [] });
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/Usage: vanta tune lora/);
  });

  it("not enough preference data → guidance + exit 1, trainer NOT invoked", async () => {
    let trained = false;
    const code = await runTuneCommand("/r", ["lora"], {
      log: () => {},
      readSignals: async () => [mockSignal(0)], // 1 pair < the min
      train: () => {
        trained = true;
        return okOutcome;
      },
    });
    expect(code).toBe(1);
    expect(trained).toBe(false); // the readiness gate blocked it
  });

  it("enough data → trains + reports success (exit 0)", async () => {
    const signals = Array.from({ length: 25 }, (_, i) => mockSignal(i));
    const lines: string[] = [];
    const code = await runTuneCommand("/r", ["lora", "--steps", "4"], {
      log: (l) => lines.push(l),
      readSignals: async () => signals,
      train: () => okOutcome,
    });
    expect(code).toBe(0);
    expect(lines.join("\n")).toMatch(/trained on mps.*adapter saved/);
  });
});
