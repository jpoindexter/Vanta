// PERSONAL-MODEL-TUNE — automatic training. When enough preference pairs have
// accrued, train a LoRA adapter on its own (no manual `vanta tune lora`). The
// autonomous gateway daemon calls `maybeAutoTune` each tick; it's a no-op unless
// VANTA_LORA_AUTO=1 (the heavy first run downloads a base model, so opting into
// fully-hands-off training is one env flag). A record prevents retraining until
// another full threshold of new pairs accrues.

import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { readPreferenceSignals, type PreferenceSignal } from "../preferences/signals.js";
import { signalToRow, buildDpoPairs } from "./lora-dataset.js";
import { runLoraTrain, type RunLoraTrainOutcome } from "./lora-train.js";

/** Pairs needed before a (re)train fires. */
export const AUTO_TUNE_THRESHOLD = 20;

/** Fully-automatic training is opt-in (the first run downloads a base model). */
export function loraAutoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VANTA_LORA_AUTO === "1";
}

/** The base model to tune (small real default; the operator can point elsewhere). */
export function autoBaseModel(env: NodeJS.ProcessEnv = process.env): string {
  const m = env.VANTA_LORA_BASE_MODEL?.trim();
  return m && m.length > 0 ? m : "Qwen/Qwen2.5-0.5B";
}

/** Persisted marker: how many pairs the last adapter was trained on. */
export type AutoTuneRecord = { lastTrainedPairs: number; lastTrainedAt?: string };

function recordPath(dataDir: string): string {
  return join(dataDir, "lora-tune.json");
}

/** Read the auto-tune record (missing/corrupt → a zero record). */
export function readAutoTuneRecord(dataDir: string, read: (p: string) => string = (p) => readFileSync(p, "utf8")): AutoTuneRecord {
  try {
    const j = JSON.parse(read(recordPath(dataDir))) as Partial<AutoTuneRecord>;
    return { lastTrainedPairs: Number(j.lastTrainedPairs) || 0, lastTrainedAt: j.lastTrainedAt };
  } catch {
    return { lastTrainedPairs: 0 };
  }
}

/** Write the auto-tune record (best-effort; dir created if missing). */
export function writeAutoTuneRecord(
  dataDir: string,
  rec: AutoTuneRecord,
  write: (p: string, c: string) => void = (p, c) => {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(p, c);
  },
): void {
  write(recordPath(dataDir), JSON.stringify(rec, null, 2) + "\n");
}

/** First train at `threshold`; retrain once another `threshold` pairs accrue. */
export function shouldAutoTune(pairs: number, lastTrainedPairs: number, threshold = AUTO_TUNE_THRESHOLD): boolean {
  return pairs >= threshold && pairs - lastTrainedPairs >= threshold;
}

/** Outcome of an auto-tune check. */
export type AutoTuneStatus =
  | { status: "trained"; pairs: number; result: RunLoraTrainOutcome }
  | { status: "ready"; pairs: number; message: string }
  | { status: "not-ready"; pairs: number };

/** Injected seams for {@link autoTuneCheck}. */
export type AutoTuneDeps = {
  dataDir: string;
  env?: NodeJS.ProcessEnv;
  readSignals?: () => Promise<PreferenceSignal[]>;
  train?: typeof runLoraTrain;
  read?: (p: string) => string;
  write?: (p: string, c: string) => void;
  stampAt?: string;
};

/**
 * Check readiness and act: train if enabled + threshold freshly crossed (record
 * the new count), surface a "ready" nudge if enough data but auto is off, else
 * not-ready. Errors-as-values via runLoraTrain; never throws.
 */
export async function autoTuneCheck(deps: AutoTuneDeps): Promise<AutoTuneStatus> {
  const env = deps.env ?? process.env;
  const signals = await (deps.readSignals ?? readPreferenceSignals)();
  const pairs = buildDpoPairs(signals.map(signalToRow));
  const rec = readAutoTuneRecord(deps.dataDir, deps.read);
  if (!shouldAutoTune(pairs.length, rec.lastTrainedPairs)) return { status: "not-ready", pairs: pairs.length };
  if (!loraAutoEnabled(env)) {
    return {
      status: "ready",
      pairs: pairs.length,
      message: `🎓 ${pairs.length} preference pairs ready to tune — set VANTA_LORA_AUTO=1 for hands-off training, or run \`vanta tune lora\`.`,
    };
  }
  const result = (deps.train ?? runLoraTrain)({ pairs, baseModel: autoBaseModel(env), steps: 200 });
  if (result.ok) writeAutoTuneRecord(deps.dataDir, { lastTrainedPairs: pairs.length, lastTrainedAt: deps.stampAt }, deps.write);
  return { status: "trained", pairs: pairs.length, result };
}

/**
 * Daemon hook (gateway tick): when fully-automatic tuning is enabled and the
 * data is ready, train + log. No-op (zero overhead) unless VANTA_LORA_AUTO=1.
 * Best-effort — never breaks the tick.
 */
export async function maybeAutoTune(
  dataDir: string,
  log: (m: string) => void,
  deps: Omit<AutoTuneDeps, "dataDir"> = {},
): Promise<void> {
  try {
    if (!loraAutoEnabled(deps.env ?? process.env)) return;
    const r = await autoTuneCheck({ dataDir, ...deps });
    if (r.status === "trained" && r.result.ok && r.result.result.ok) {
      log(`🎓 auto-tuned a LoRA adapter on ${r.pairs} preference pairs → ${r.result.result.adapterDir}`);
    }
  } catch {
    /* never break the daemon tick on a tuning hiccup */
  }
}
