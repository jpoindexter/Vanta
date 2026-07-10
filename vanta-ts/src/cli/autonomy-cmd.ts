import { dataDirFor } from "./ops.js";
import {
  decideAutonomy,
  formatAutonomyContract,
  formatAutonomyDecision,
  loadAutonomyContract,
  writeDefaultAutonomyContract,
  type AutonomyAction,
} from "../autonomy/contract.js";
import { formatPendingAutonomy, loadPendingAutonomy, surfaceAutonomyDecision, type AutonomySurfaceDeps } from "../autonomy/surface.js";
import {
  applyTrustGate,
  formatTrustLedger,
  formatTrustWorkflow,
  loadTrustLedger,
  loadTrustPolicy,
  recordTrustOutcome,
} from "../autonomy/trust.js";

export async function runAutonomyCommand(repoRoot: string, rest: string[] = [], deps: AutonomySurfaceDeps = {}): Promise<number> {
  const dataDir = dataDirFor(repoRoot);
  const sub = rest[0] ?? "show";
  if (sub === "init") {
    console.log(`wrote ${await writeDefaultAutonomyContract(dataDir)}`);
    return 0;
  }
  if (sub === "show") {
    console.log(formatAutonomyContract(await loadAutonomyContract(dataDir)));
    return 0;
  }
  if (sub === "pending") {
    console.log(formatPendingAutonomy(await loadPendingAutonomy(dataDir)));
    return 0;
  }
  if (sub === "trust") return runTrust(dataDir, rest.slice(1));
  if (sub === "decide") return runDecide(dataDir, rest.slice(1), deps);
  console.error("usage: vanta autonomy [show|init|pending|trust|decide <kind> <low|medium|high> <summary>]");
  return 1;
}

async function runDecide(dataDir: string, rest: string[], deps: AutonomySurfaceDeps): Promise<number> {
  const action = parseAction(rest);
  if (!action) {
    console.error("usage: vanta autonomy decide <kind> <low|medium|high> <summary>");
    return 1;
  }
  const decision = applyTrustGate(
    decideAutonomy(await loadAutonomyContract(dataDir), action),
    await loadTrustLedger(dataDir),
    await loadTrustPolicy(dataDir),
  );
  const log = await surfaceAutonomyDecision(dataDir, decision, deps);
  console.log(formatAutonomyDecision(decision));
  console.log(`Log: ${log}`);
  return decision.lane === "wakes-me" ? 2 : 0;
}

async function runTrust(dataDir: string, rest: string[]): Promise<number> {
  const sub = rest[0] ?? "show";
  if (sub === "show" || sub === "list") {
    console.log(formatTrustLedger(await loadTrustLedger(dataDir), await loadTrustPolicy(dataDir)));
    return 0;
  }
  if (sub === "pass" || sub === "fail") {
    const [workflowId, ...reason] = rest.slice(1);
    if (!workflowId || !reason.length) {
      console.error("usage: vanta autonomy trust <pass|fail> <workflow-id> <reason>");
      return 1;
    }
    const workflow = await recordTrustOutcome(dataDir, {
      workflowId,
      outcome: sub,
      reason: reason.join(" "),
      policy: await loadTrustPolicy(dataDir),
    });
    console.log(formatTrustWorkflow(workflow));
    return 0;
  }
  console.error("usage: vanta autonomy trust [show|pass <workflow-id> <reason>|fail <workflow-id> <reason>]");
  return 1;
}

function parseAction(rest: string[]): AutonomyAction | null {
  const [kind, risk, ...summary] = rest;
  if (!kind || !["low", "medium", "high"].includes(risk ?? "") || !summary.length) return null;
  return { kind, risk: risk as AutonomyAction["risk"], summary: summary.join(" ") };
}
