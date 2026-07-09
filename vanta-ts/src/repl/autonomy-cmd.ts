import {
  decideAutonomy,
  formatAutonomyContract,
  formatAutonomyDecision,
  loadAutonomyContract,
  logAutonomyDecision,
} from "../autonomy/contract.js";
import type { SlashHandler } from "./types.js";

export const autonomy: SlashHandler = async (arg, ctx) => {
  const rest = arg.trim().split(/\s+/).filter(Boolean);
  if (rest[0] === "decide") {
    const [kind, risk, ...summary] = rest.slice(1);
    if (!kind || !["low", "medium", "high"].includes(risk ?? "") || !summary.length) {
      return { output: "  usage: /autonomy decide <kind> <low|medium|high> <summary>" };
    }
    const decision = decideAutonomy(await loadAutonomyContract(ctx.dataDir), { kind, risk: risk as "low" | "medium" | "high", summary: summary.join(" ") });
    const log = await logAutonomyDecision(ctx.dataDir, decision, ctx.now);
    return { output: `${formatAutonomyDecision(decision)}\nLog: ${log}` };
  }
  return { output: formatAutonomyContract(await loadAutonomyContract(ctx.dataDir)) };
};
