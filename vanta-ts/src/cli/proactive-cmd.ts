import { dataDirFor, buildCronRunTask } from "./ops.js";
import { resolveProactiveConfig, decideProactiveTick, type ProactiveConfig } from "../proactive/policy.js";
import { loadProactiveState } from "../proactive/store.js";
import { runProactiveTick } from "../proactive/tick.js";
import { resolveOutreachConfig, silenceOutreach, outreachTickText } from "../proactive/outreach.js";
import { loadOutreachState, saveOutreachState } from "../proactive/outreach-store.js";
import { sendOutreach } from "../proactive/outreach-send.js";
import { peekLoopWakeCount, drainLoopWakes } from "../loop/wake.js";
import { loadDef } from "../loop/store.js";
import { getBudget } from "../budget/store.js";
import { isExceeded } from "../budget/types.js";
import { decideAutonomy, loadAutonomyContract, logAutonomyDecision } from "../autonomy/contract.js";

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

/** Run each queued loop wake whose loop is still active (mirrors the gateway). */
async function fireQueuedWakes(repoRoot: string, dataDir: string, log: (m: string) => void): Promise<number> {
  const wakes = await drainLoopWakes(dataDir);
  const runTask = buildCronRunTask(repoRoot);
  const contract = await loadAutonomyContract(dataDir);
  let ran = 0;
  for (const wake of wakes) {
    const def = await loadDef(dataDir, wake.goal_id);
    if (!def || def.status !== "active") { log(`skip ${wake.goal_id} (not active)`); continue; }
    const decision = decideAutonomy(contract, {
      kind: "proactive.loop.advance",
      summary: `advance loop ${def.id}: ${def.goal}`,
      risk: "low",
      source: "vanta proactive run",
    });
    await logAutonomyDecision(dataDir, decision);
    if (decision.lane !== "acts-alone") { log(`${decision.lane} ${def.id} by ${decision.ruleId}`); continue; }
    log(`acts-alone ${def.id} by ${decision.ruleId}`);
    await runTask(`Proactively advance loop ${def.id}: ${def.goal}`, wake);
    ran += 1;
  }
  return ran;
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

async function runOnce(repoRoot: string, dataDir: string, config: ProactiveConfig): Promise<number> {
  const log = (m: string): void => console.log(`  ${m}`);
  const result = await runProactiveTick({
    dataDir,
    now: new Date(),
    config,
    queuedCount: await peekLoopWakeCount(dataDir),
    budgetExceeded: await budgetExceededFor(dataDir, config.budgetScope),
    runBatch: () => fireQueuedWakes(repoRoot, dataDir, log),
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

export async function runProactiveCommand(repoRoot: string, rest: string[]): Promise<number> {
  const dataDir = dataDirFor(repoRoot);
  const config = resolveProactiveConfig(process.env);
  const sub = rest[0] ?? "status";
  if (sub === "status") return runStatus(dataDir, config);
  if (sub === "run") return runOnce(repoRoot, dataDir, config);
  if (sub === "silence") return runSilence(dataDir, rest[1]);
  console.error("usage: vanta proactive [status|run|silence <minutes|off>]");
  return 1;
}
