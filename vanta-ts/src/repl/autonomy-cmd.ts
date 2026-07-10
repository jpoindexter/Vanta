import {
  decideAutonomy,
  formatAutonomyContract,
  formatAutonomyDecision,
  loadAutonomyContract,
  type AutonomyAction,
} from "../autonomy/contract.js";
import { formatPendingAutonomy, loadPendingAutonomy, surfaceAutonomyDecision } from "../autonomy/surface.js";
import {
  applyTrustGate,
  formatTrustLedger,
  formatTrustWorkflow,
  loadTrustLedger,
  loadTrustPolicy,
  recordTrustOutcome,
} from "../autonomy/trust.js";
import type { ReplCtx, SlashHandler, SlashResult } from "./types.js";

export const autonomy: SlashHandler = async (arg, ctx) => {
  const rest = arg.trim().split(/\s+/).filter(Boolean);
  if (rest[0] === "trust") return runTrust(rest.slice(1), ctx);
  if (rest[0] === "decide") return runDecide(rest.slice(1), ctx);
  if (rest[0] === "pending") return { output: formatPendingAutonomy(await loadPendingAutonomy(ctx.dataDir)) };
  return { output: formatAutonomyContract(await loadAutonomyContract(ctx.dataDir)) };
};

async function runTrust(rest: string[], ctx: ReplCtx): Promise<SlashResult> {
  const sub = rest[0] ?? "show";
  if (sub === "show" || sub === "list") {
    return { output: formatTrustLedger(await loadTrustLedger(ctx.dataDir), await loadTrustPolicy(ctx.dataDir)) };
  }
  if (sub === "pass" || sub === "fail") return recordTrust(sub, rest.slice(1), ctx);
  return { output: "  usage: /autonomy trust [show|pass <workflow-id> <reason>|fail <workflow-id> <reason>]" };
}

async function recordTrust(outcome: "pass" | "fail", rest: string[], ctx: ReplCtx): Promise<SlashResult> {
  const [workflowId, ...reason] = rest;
  if (!workflowId || !reason.length) return { output: "  usage: /autonomy trust <pass|fail> <workflow-id> <reason>" };
  const workflow = await recordTrustOutcome(ctx.dataDir, {
    workflowId,
    outcome,
    reason: reason.join(" "),
    now: ctx.now(),
    policy: await loadTrustPolicy(ctx.dataDir),
  });
  return { output: formatTrustWorkflow(workflow) };
}

async function runDecide(rest: string[], ctx: ReplCtx): Promise<SlashResult> {
  const action = parseAction(rest);
  if (!action) return { output: "  usage: /autonomy decide <kind> <low|medium|high> <summary>" };
  const decision = applyTrustGate(
    decideAutonomy(await loadAutonomyContract(ctx.dataDir), action),
    await loadTrustLedger(ctx.dataDir),
    await loadTrustPolicy(ctx.dataDir),
  );
  const log = await surfaceAutonomyDecision(ctx.dataDir, decision, { now: ctx.now });
  return { output: `${formatAutonomyDecision(decision)}\nLog: ${log}` };
}

function parseAction(rest: string[]): AutonomyAction | null {
  const [kind, risk, ...summary] = rest;
  if (!kind || !["low", "medium", "high"].includes(risk ?? "") || !summary.length) return null;
  return { kind, risk: risk as AutonomyAction["risk"], summary: summary.join(" ") };
}
