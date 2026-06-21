// `vanta tune lora [--base-model <id>] [--steps N]` — train a personal LoRA
// adapter from accumulated preference signals (PERSONAL-MODEL-TUNE). Reads
// ~/.vanta/preferences.jsonl → DPO pairs → a readiness gate (refuses to train on
// too little data) → the real local LoRA trainer (meta-tune/lora-train.ts).
// Operator-run; the trainer is a local python subprocess, not an agent action.

import { readPreferenceSignals, type PreferenceSignal } from "../preferences/signals.js";
import { signalToRow, buildDpoPairs, datasetReadiness, formatDatasetStats } from "../meta-tune/lora-dataset.js";
import { runLoraTrain, type RunLoraTrainOutcome } from "../meta-tune/lora-train.js";

/** Read a `--flag <value>` from args (returns undefined when absent). */
function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Injected seams for {@link runTuneCommand}. */
export type TuneDeps = {
  log?: (line: string) => void;
  readSignals?: () => Promise<PreferenceSignal[]>;
  train?: typeof runLoraTrain;
};

/** Format a finished train outcome into operator-facing lines + an exit code. */
function reportTrain(out: RunLoraTrainOutcome, log: (l: string) => void): number {
  if (!out.ok) {
    log(`✗ ${out.reason}`);
    return 1;
  }
  if (!out.result.ok) {
    log(`✗ training failed: ${out.result.error}`);
    return 1;
  }
  const r = out.result;
  log(
    `✓ trained on ${r.device}: ${r.trainableLoraParams} LoRA params, loss ${r.lossFirst}→${r.lossLast} ` +
      `(${r.lossDecreased ? "↓" : "↑"}), adapter saved to ${r.adapterDir}`,
  );
  return 0;
}

/**
 * `vanta tune lora` handler. Returns a process exit code (0 ok). Never throws —
 * insufficient data → a clear "use Vanta more" message + exit 1.
 */
export async function runTuneCommand(repoRoot: string, rest: string[], deps: TuneDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  const [sub = "lora", ...args] = rest;
  if (sub !== "lora") {
    log("Usage: vanta tune lora [--base-model <hf-model-id>] [--steps N]");
    return 1;
  }
  const signals = await (deps.readSignals ?? readPreferenceSignals)();
  const pairs = buildDpoPairs(signals.map(signalToRow));
  log(formatDatasetStats(pairs));
  const readiness = datasetReadiness(pairs);
  if (!readiness.ready) {
    log(`Not enough preference data: ${readiness.reason}.`);
    log("Keep using Vanta — every approve/deny + chosen-vs-rejected decision accrues a pair.");
    return 1;
  }
  const baseModel = flagValue(args, "--base-model");
  const stepsRaw = flagValue(args, "--steps");
  const steps = stepsRaw && Number.isFinite(Number(stepsRaw)) ? Number(stepsRaw) : undefined;
  log(`Training a LoRA adapter on ${pairs.length} preference pairs (base: ${baseModel ?? "tiny-test"})…`);
  const out = (deps.train ?? runLoraTrain)({ pairs, baseModel, steps });
  return reportTrain(out, log);
}
