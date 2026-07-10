import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  exportDatasetJsonl,
  buildLoraTrainArgs,
  parseLoraTrainResult,
  runLoraTrain,
  LORA_TRAIN_SCRIPT,
  type PythonRunner,
} from "./lora-train.js";

describe("exportDatasetJsonl", () => {
  it("writes one JSON object per line", () => {
    let written = "";
    exportDatasetJsonl([{ prompt: "p", chosen: "c", rejected: "r" }], "/ds.jsonl", (_p, c) => {
      written = c;
    });
    expect(written.trim()).toBe('{"prompt":"p","chosen":"c","rejected":"r"}');
  });
});

describe("buildLoraTrainArgs", () => {
  it("builds the python trainer argv with the script + flags", () => {
    const a = buildLoraTrainArgs({ datasetPath: "/ds", outputDir: "/out", baseModel: "tiny-test", steps: 4 });
    expect(a[0]).toBe(LORA_TRAIN_SCRIPT);
    expect(a).toEqual([LORA_TRAIN_SCRIPT, "--dataset", "/ds", "--output", "/out", "--base-model", "tiny-test", "--steps", "4", "--max-length", "512"]);
  });
});

describe("parseLoraTrainResult", () => {
  it("parses the trainer's JSON success line (ignoring warnings above it)", () => {
    const r = parseLoraTrainResult(
      'some warning\n{"ok":true,"device":"mps","examples":3,"trainable_lora_params":2048,"loss_first":5.5,"loss_last":5.4,"loss_decreased":true,"adapter_saved":true,"adapter_dir":"/x"}',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.device).toBe("mps");
    expect(r.lossDecreased).toBe(true);
    expect(r.adapterSaved).toBe(true);
  });
  it("garbage / {ok:false} → error", () => {
    expect(parseLoraTrainResult("not json").ok).toBe(false);
    expect(parseLoraTrainResult('{"ok":false,"error":"no data"}').ok).toBe(false);
  });
});

describe("runLoraTrain (readiness gate + injected python)", () => {
  const pairs = [
    { prompt: "p1", chosen: "c1", rejected: "r1" },
    { prompt: "p2", chosen: "c2", rejected: "r2" },
  ];

  it("too little data → not-ready gate, the trainer is NOT invoked", () => {
    let called = false;
    const run: PythonRunner = () => {
      called = true;
      return "";
    };
    const out = runLoraTrain({ pairs, minPairs: 20, runPython: run, write: () => {} });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/need \d+ more pair/);
    expect(called).toBe(false);
  });

  it("ready → exports the dataset + invokes the trainer + parses the result", () => {
    const run: PythonRunner = () =>
      '{"ok":true,"device":"cpu","examples":2,"trainable_lora_params":1024,"loss_first":3,"loss_last":2.5,"loss_decreased":true,"adapter_saved":true,"adapter_dir":"/a"}';
    let wrote = "";
    const out = runLoraTrain({ pairs, minPairs: 2, runPython: run, write: (_p, c) => (wrote = c) });
    expect(out.ok).toBe(true);
    if (out.ok && out.result.ok) expect(out.result.adapterSaved).toBe(true);
    expect(wrote).toContain('"chosen":"c1"'); // dataset genuinely exported
  });
});

// LIVE: actually train a tiny LoRA (from-config model, no download) on MPS/CPU.
// Opt-in (a real train is slow) — proven manually + here with VANTA_TEST_LORA=1.
function loraDepsAvailable(): boolean {
  try {
    execFileSync("python3", ["-c", "import peft, transformers, torch"], { timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}
const LIVE = loraDepsAvailable() && process.env.VANTA_TEST_LORA === "1";

describe.skipIf(!LIVE)("runLoraTrain (LIVE tiny LoRA train)", () => {
  it("trains a real LoRA adapter from preference pairs and saves it", () => {
    const pairs = Array.from({ length: 3 }, (_, i) => ({
      prompt: `question ${i}`,
      chosen: `the preferred concise answer ${i}`,
      rejected: `a rambling worse answer ${i}`,
    }));
    const out = runLoraTrain({ pairs, minPairs: 2, baseModel: "tiny-test", steps: 4 });
    expect(out.ok).toBe(true);
    if (!out.ok || !out.result.ok) return;
    expect(out.result.trainableLoraParams).toBeGreaterThan(0); // LoRA adapter applied
    expect(out.result.adapterSaved).toBe(true); // real adapter weights written
  });
});
