import {
  executeEffect,
  stableEffectId,
  type EffectGateContext,
} from "../effects/execute-effect.js";
import { runCronScript, type ScriptResult } from "./script-run.js";
import { scriptSha256, type CronEntry } from "./cron.js";

export async function runScheduledScript(opts: {
  entry: CronEntry;
  script: string;
  context?: EffectGateContext;
  windowKey: string;
  run?: (script: string) => Promise<ScriptResult>;
}): Promise<ScriptResult> {
  if (!opts.context) return { ok: false, output: "needs human: scheduler effect gate unavailable" };
  const hash = scriptSha256(opts.script);
  const seed = {
    host: "scheduler",
    kind: "scheduler.script.execute",
    targetClass: "local-shell",
    payloadSha256: hash,
    idempotencyKey: `schedule:${opts.entry.id}:${opts.windowKey}`,
  };
  const result = await executeEffect({
    id: stableEffectId(seed),
    actor: `schedule:${opts.entry.id}`,
    action: `execute authorized scheduled script #${opts.entry.id} at sha256:${hash}`,
    ...seed,
  }, opts.context, async () => {
    const value = await (opts.run ?? runCronScript)(opts.script);
    return {
      value,
      acknowledgementId: `schedule:${opts.entry.id}:started`,
      failed: !value.ok,
    };
  });
  if (result.outcome === "failed" && result.value) return result.value;
  if (result.outcome !== "confirmed" && result.outcome !== "verified") {
    return { ok: false, output: `needs human: scheduled script effect ${result.outcome}` };
  }
  return result.value ?? { ok: false, output: "script effect settled without a result" };
}
