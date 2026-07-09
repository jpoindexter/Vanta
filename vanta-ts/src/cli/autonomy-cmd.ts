import { dataDirFor } from "./ops.js";
import {
  decideAutonomy,
  formatAutonomyContract,
  formatAutonomyDecision,
  loadAutonomyContract,
  logAutonomyDecision,
  writeDefaultAutonomyContract,
  type AutonomyAction,
} from "../autonomy/contract.js";

export async function runAutonomyCommand(repoRoot: string, rest: string[] = []): Promise<number> {
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
  if (sub === "decide") return runDecide(dataDir, rest.slice(1));
  console.error("usage: vanta autonomy [show|init|decide <kind> <low|medium|high> <summary>]");
  return 1;
}

async function runDecide(dataDir: string, rest: string[]): Promise<number> {
  const action = parseAction(rest);
  if (!action) {
    console.error("usage: vanta autonomy decide <kind> <low|medium|high> <summary>");
    return 1;
  }
  const decision = decideAutonomy(await loadAutonomyContract(dataDir), action);
  const log = await logAutonomyDecision(dataDir, decision);
  console.log(formatAutonomyDecision(decision));
  console.log(`Log: ${log}`);
  return decision.lane === "wakes-me" ? 2 : 0;
}

function parseAction(rest: string[]): AutonomyAction | null {
  const [kind, risk, ...summary] = rest;
  if (!kind || !["low", "medium", "high"].includes(risk ?? "") || !summary.length) return null;
  return { kind, risk: risk as AutonomyAction["risk"], summary: summary.join(" ") };
}
