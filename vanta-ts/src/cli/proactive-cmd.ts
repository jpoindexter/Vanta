import { dataDirFor, buildCronRunTask } from "./ops.js";
import { resolveProactiveConfig, decideProactiveTick, type ProactiveConfig } from "../proactive/policy.js";
import { loadProactiveState } from "../proactive/store.js";
import { runProactiveTick } from "../proactive/tick.js";
import { resolveOutreachConfig, silenceOutreach, outreachTickText } from "../proactive/outreach.js";
import { loadOutreachState, saveOutreachState } from "../proactive/outreach-store.js";
import { sendOutreach } from "../proactive/outreach-send.js";
import { peekLoopWakeCount, drainLoopWakes, enqueueLoopWake } from "../loop/wake.js";
import { loadDef } from "../loop/store.js";
import type { LoopDef, WakeContext } from "../loop/types.js";
import type { RunTask } from "../schedule/runner.js";
import { getBudget } from "../budget/store.js";
import { isExceeded } from "../budget/types.js";
import { decideAutonomy, loadAutonomyContract, logAutonomyDecision } from "../autonomy/contract.js";
import { applyTrustGate, loadTrustLedger, loadTrustPolicy, recordTrustOutcome, workflowIdForDecision } from "../autonomy/trust.js";

// `vanta proactive` — KAIROS heartbeat. `status` shows the throttle + whether it
// would tick now; `run` fires one throttled pickup of queued loop wakes, then
// (PROACTIVE-CHANNEL-OUTREACH) pings the configured channel about the finished
// work — opt-in, throttled, budget-bounded; `silence <minutes|off>` pauses the
// pings. Designed to be cron-invoked: an idle, user-away host advances queued
// loops on its own and messages you FIRST when it did.

async function budgetExceededFor(dataDir: string, scope: string): Promise<boolean> {
  const b = await getBudget(dataDir, scope);
  return b ? isExceeded(b) : false;
}

function loopDecision(contract: Awaited<ReturnType<typeof loadAutonomyContract>>, def: LoopDef) {
  return decideAutonomy(contract, {
    kind: "proactive.loop.advance",
    summary: `advance loop ${def.id}: ${def.goal}`,
    risk: "low",
    source: `loop:${def.id}`,
  });
}

async function requeueWakes(dataDir: string, wakes: WakeContext[]): Promise<void> {
  for (const wake of wakes) await enqueueLoopWake(dataDir, wake);
}

type ExecuteWakeArgs = {
  dataDir: string;
  def: LoopDef;
  wake: WakeContext;
  runTask: RunTask;
  log: (message: string) => void;
};

async function executeVerifiedWake(args: ExecuteWakeArgs): Promise<boolean> {
  const { dataDir, def, wake, runTask, log } = args;
  const policy = await loadTrustPolicy(dataDir);
  const workflowId = workflowIdForDecision(loopDecision(await loadAutonomyContract(dataDir), def));
  try {
    await runTask(`Proactively advance loop ${def.id}: ${def.goal}`, wake);
    const trust = await recordTrustOutcome(dataDir, { workflowId, outcome: "pass", reason: `verified proactive loop ${def.id}`, policy });
    log(`verified ${def.id}; trust ${trust.tier} (${trust.passes}/${trust.runs} pass)`);
    return true;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await recordTrustOutcome(dataDir, { workflowId, outcome: "fail", reason, policy });
    log(`failed ${def.id}; trust demoted: ${reason}`);
    return false;
  }
}

/** Run autonomous wakes and preserve every wake that still requires approval. */
export async function processQueuedWakes(dataDir: string, runTask: RunTask, log: (m: string) => void): Promise<number> {
  const wakes = await drainLoopWakes(dataDir);
  const contract = await loadAutonomyContract(dataDir);
  const policy = await loadTrustPolicy(dataDir);
  let ran = 0;
  for (const wake of wakes) {
    const def = await loadDef(dataDir, wake.goal_id);
    if (!def || def.status !== "active") { log(`skip ${wake.goal_id} (not active)`); continue; }
    const baseDecision = loopDecision(contract, def);
    const decision = applyTrustGate(baseDecision, await loadTrustLedger(dataDir), policy);
    await logAutonomyDecision(dataDir, decision);
    if (decision.lane !== "acts-alone") {
      await enqueueLoopWake(dataDir, wake);
      log(`${decision.lane} ${def.id} by ${decision.ruleId}; kept queued`);
      continue;
    }
    log(`acts-alone ${def.id} by ${decision.ruleId}`);
    if (await executeVerifiedWake({ dataDir, def, wake, runTask, log })) ran += 1;
    else await enqueueLoopWake(dataDir, wake);
  }
  return ran;
}

/** Explicit operator verification consumes one matching wake and records its real outcome. */
export async function verifyQueuedWake(dataDir: string, loopId: string, runTask: RunTask, log: (m: string) => void): Promise<number> {
  const wakes = await drainLoopWakes(dataDir);
  const index = wakes.findIndex((wake) => wake.goal_id === loopId);
  if (index < 0) {
    await requeueWakes(dataDir, wakes);
    log(`no queued wake for ${loopId}`);
    return 1;
  }
  const [wake] = wakes.splice(index, 1);
  await requeueWakes(dataDir, wakes);
  const def = await loadDef(dataDir, loopId);
  if (!wake || !def || def.status !== "active") {
    log(`cannot verify ${loopId} (loop is not active)`);
    return 1;
  }
  const passed = await executeVerifiedWake({ dataDir, def, wake, runTask, log });
  if (!passed) await enqueueLoopWake(dataDir, wake);
  return passed ? 0 : 2;
}

/** One human line on the outreach channel state, appended to `status`. */
async function outreachStatusLine(dataDir: string, env: NodeJS.ProcessEnv, now: Date): Promise<string> {
  const c = resolveOutreachConfig(env);
  if (!c.enabled || !c.to) return "  outreach: disabled (set VANTA_OUTREACH=1 + VANTA_OUTREACH_TO=platform:chatId to get pinged)";
  const s = await loadOutreachState(dataDir);
  if (s.silencedUntil && now < new Date(s.silencedUntil)) return `  outreach: silenced until ${s.silencedUntil} (\`vanta proactive silence off\` to resume)`;
  const sentToday = s.day === now.toISOString().slice(0, 10) ? s.sentToday : 0;
  return `  outreach: → ${c.to} · interval≥${c.minIntervalMin}m · ${sentToday}/${c.maxPerDay} today`;
}

async function runStatus(dataDir: string, config: ProactiveConfig): Promise<number> {
  const now = new Date();
  const decision = decideProactiveTick({
    config,
    state: await loadProactiveState(dataDir),
    now,
    queuedCount: await peekLoopWakeCount(dataDir),
    budgetExceeded: await budgetExceededFor(dataDir, config.budgetScope),
  });
  console.log(`proactive: ${config.enabled ? "enabled" : "disabled"} · would tick now: ${decision.tick ? "yes" : `no (${decision.reason})`}`);
  console.log(`  throttle: idle≥${config.minIdleMin}m · interval≥${config.minIntervalMin}m · ≤${config.maxPerDay}/day · budget scope "${config.budgetScope}"`);
  console.log(await outreachStatusLine(dataDir, process.env, now));
  return 0;
}

async function runOnce(dataDir: string, config: ProactiveConfig, runTask: RunTask): Promise<number> {
  const log = (m: string): void => console.log(`  ${m}`);
  const result = await runProactiveTick({
    dataDir,
    now: new Date(),
    config,
    queuedCount: await peekLoopWakeCount(dataDir),
    budgetExceeded: await budgetExceededFor(dataDir, config.budgetScope),
    runBatch: () => processQueuedWakes(dataDir, runTask, log),
  });
  console.log(result.tick ? `proactive tick: fired ${result.ran} queued wake(s)` : `proactive tick skipped: ${result.reason}`);
  if (result.tick && result.ran > 0) {
    const ping = await sendOutreach({ dataDir, env: process.env, now: new Date(), text: outreachTickText(result.ran) });
    console.log(ping.sent ? `  outreach: pinged ${resolveOutreachConfig(process.env).to}` : `  outreach skipped: ${ping.reason}`);
  }
  return 0;
}

/** `silence <minutes|off>` — pause (or resume) the unprompted pings. */
async function runSilence(dataDir: string, arg: string | undefined): Promise<number> {
  const state = await loadOutreachState(dataDir);
  if (arg === "off") {
    await saveOutreachState(dataDir, silenceOutreach(state, null));
    console.log("outreach: silence lifted");
    return 0;
  }
  const minutes = Number(arg);
  if (!arg || !Number.isFinite(minutes) || minutes <= 0) {
    console.error("usage: vanta proactive silence <minutes|off>");
    return 1;
  }
  const until = new Date(Date.now() + minutes * 60_000);
  await saveOutreachState(dataDir, silenceOutreach(state, until));
  console.log(`outreach: silenced until ${until.toISOString()}`);
  return 0;
}

export async function runProactiveCommand(repoRoot: string, rest: string[], deps: { runTask?: RunTask } = {}): Promise<number> {
  const dataDir = dataDirFor(repoRoot);
  const runTask = deps.runTask ?? buildCronRunTask(repoRoot);
  const config = resolveProactiveConfig(process.env);
  const sub = rest[0] ?? "status";
  if (sub === "status") return runStatus(dataDir, config);
  if (sub === "run") return runOnce(dataDir, config, runTask);
  if (sub === "verify") {
    if (!rest[1]) { console.error("usage: vanta proactive verify <loop-id>"); return 1; }
    return verifyQueuedWake(dataDir, rest[1], runTask, (m) => console.log(`  ${m}`));
  }
  if (sub === "silence") return runSilence(dataDir, rest[1]);
  console.error("usage: vanta proactive [status|run|verify <loop-id>|silence <minutes|off>]");
  return 1;
}
