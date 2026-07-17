import {
  aggregateSchemaQuality,
  formatSchemaQualityForCli,
  readSchemaQualityScorecards,
} from "../schema/quality-ledger.js";
import type { SlashHandler } from "./types.js";

export const schemaQuality: SlashHandler = async (arg, ctx) => {
  const scorecards = await readSchemaQualityScorecards(ctx.dataDir);
  if (scorecards.length === 0) return { output: "No Schema quality scorecards are recorded." };
  if (arg.trim() === "summary") {
    const value = aggregateSchemaQuality(scorecards);
    return { output: [
      `Schema quality summary: ${value.runs} run(s) · ${value.certifiedRuns} certified`,
      `Beliefs: ${value.beliefs.exact} exact · ${value.beliefs.partial} partial · ${value.beliefs.untested} untested · ${value.beliefs.contradicted} contradicted`,
      `Real actions: ${value.realActionsVerified}/${value.realActionsAttempted} verified · simulated calls: ${value.simulatedSandboxCalls}`,
    ].join("\n") };
  }
  const latest = [...scorecards].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]!;
  return { output: formatSchemaQualityForCli(latest) };
};
