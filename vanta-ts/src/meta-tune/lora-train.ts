// VANTA PERSONAL-MODEL-TUNE — LoRA training orchestrator.
//
// Ties the pure dataset prep (lora-dataset.ts) to the REAL local LoRA trainer
// (lora_train.py — peft + transformers on MPS/CUDA/CPU). Exports the preference
// pairs as JSONL, gates on dataset readiness (won't train on too little data),
// then invokes the python trainer and parses its result. The python runner is
// the injected seam — real by default, mocked in unit tests; a live train of a
// tiny from-config model is proven by an opt-in integration test.
//
// This is an operator-run CLI step (`vanta tune lora`), not an agent tool — the
// operator trains their own local adapter from their own accumulated preference
// data; nothing here runs unattended.

import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DpoPair, type DatasetReadiness, datasetReadiness } from "./lora-dataset.js";

/** Absolute path to the bundled python LoRA trainer. */
export const LORA_TRAIN_SCRIPT = fileURLToPath(new URL("./lora_train.py", import.meta.url));

/** Runs `python3 <argv>` and returns stdout. The single impure seam. */
export type PythonRunner = (argv: readonly string[]) => string;

/** The live python runner (10-minute cap — a real train can be slow). */
export const realPythonRunner: PythonRunner = (argv) =>
  execFileSync("python3", argv as string[], { encoding: "utf8", timeout: 600_000 });

/** A successful train's metrics, or an error — mirrors lora_train.py's JSON. */
export type LoraTrainResult =
  | {
      ok: true;
      device: string;
      examples: number;
      trainableLoraParams: number;
      lossFirst: number;
      lossLast: number;
      lossDecreased: boolean;
      adapterSaved: boolean;
      adapterDir: string;
    }
  | { ok: false; error: string };

/** Write DPO pairs as a JSONL dataset (one object per line). */
export function exportDatasetJsonl(
  pairs: readonly DpoPair[],
  path: string,
  write: (p: string, c: string) => void = (p, c) => writeFileSync(p, c),
): void {
  write(path, pairs.map((p) => JSON.stringify(p)).join("\n") + "\n");
}

/** Options for {@link buildLoraTrainArgs}. */
export type LoraTrainArgs = { datasetPath: string; outputDir: string; baseModel?: string; steps?: number };

/** Build the `python3 lora_train.py …` argv (DISCRETE — never a shell string). */
export function buildLoraTrainArgs(opts: LoraTrainArgs): string[] {
  return [
    LORA_TRAIN_SCRIPT,
    "--dataset",
    opts.datasetPath,
    "--output",
    opts.outputDir,
    "--base-model",
    opts.baseModel ?? "tiny-test",
    "--steps",
    String(opts.steps ?? 4),
  ];
}

/** Parse lora_train.py's single JSON output line. Tolerant — garbage → error. */
export function parseLoraTrainResult(stdout: string): LoraTrainResult {
  const line = stdout.trim().split("\n").filter(Boolean).pop() ?? "";
  try {
    const j = JSON.parse(line) as Record<string, unknown>;
    if (j.ok !== true) return { ok: false, error: String(j.error ?? "training failed") };
    return {
      ok: true,
      device: String(j.device),
      examples: Number(j.examples),
      trainableLoraParams: Number(j.trainable_lora_params),
      lossFirst: Number(j.loss_first),
      lossLast: Number(j.loss_last),
      lossDecreased: Boolean(j.loss_decreased),
      adapterSaved: Boolean(j.adapter_saved),
      adapterDir: String(j.adapter_dir),
    };
  } catch {
    return { ok: false, error: "could not parse trainer output" };
  }
}

/** Injected seams + inputs for {@link runLoraTrain}. */
export type RunLoraTrainDeps = {
  pairs: readonly DpoPair[];
  runPython?: PythonRunner;
  write?: (p: string, c: string) => void;
  datasetPath?: string;
  outputDir?: string;
  baseModel?: string;
  steps?: number;
  minPairs?: number;
};

/** Outcome: the train result (+ readiness), or a not-ready/error gate. */
export type RunLoraTrainOutcome =
  | { ok: true; result: LoraTrainResult; readiness: DatasetReadiness }
  | { ok: false; reason: string; readiness: DatasetReadiness };

/**
 * Run a LoRA train: gate on dataset readiness, export the JSONL, invoke the
 * python trainer, parse the result. Errors-as-values — too little data → a
 * not-ready gate (no train); a python failure → `{ ok:false, reason }`; never
 * throws.
 */
export function runLoraTrain(deps: RunLoraTrainDeps): RunLoraTrainOutcome {
  const readiness = datasetReadiness(deps.pairs, deps.minPairs);
  if (!readiness.ready) return { ok: false, reason: readiness.reason, readiness };
  const datasetPath = deps.datasetPath ?? join(tmpdir(), `vanta_lora_ds_${process.pid}.jsonl`);
  const outputDir = deps.outputDir ?? join(tmpdir(), `vanta_lora_adapter_${process.pid}`);
  exportDatasetJsonl(deps.pairs, datasetPath, deps.write);
  const run = deps.runPython ?? realPythonRunner;
  try {
    const stdout = run(buildLoraTrainArgs({ datasetPath, outputDir, baseModel: deps.baseModel, steps: deps.steps }));
    return { ok: true, result: parseLoraTrainResult(stdout), readiness };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e), readiness };
  }
}
