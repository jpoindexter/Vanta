import { join } from "node:path";
import { buildRegistry } from "../tools/index.js";
import {
  formatFreshActivationReviewPacket,
  recordFreshActivationReview,
  runFreshContextActivationReview,
  runFreshWorkspaceActivationProof,
} from "../repl/activation-review.js";
import {
  formatWhatCanIDo,
  runColdActivationCheck,
  runWorkflowDemo,
  workflowViews,
} from "../repl/what-can-i-do-cmd.js";

function recordReviewText(rest: string[]): string | null {
  return rest[0] === "--record-review" ? rest.slice(1).join(" ").trim() || null : null;
}

export async function runWhatCanIDoCommand(rest: string[] = [], dataDir = join(process.cwd(), ".vanta")): Promise<number> {
  if (rest[0] === "--demo") {
    console.log(runWorkflowDemo(rest[1] ?? ""));
    return 0;
  }
  const toolNames = buildRegistry().schemas().map((schema) => schema.name);
  const proofCode = await runProofCommand(rest, dataDir, toolNames);
  if (proofCode !== null) return proofCode;
  const reviewText = recordReviewText(rest);
  if (reviewText) {
    const file = await recordFreshActivationReview(dataDir, { reviewer: "fresh-context", confusion: reviewText });
    console.log(`  ✓ fresh-context review recorded → ${file}`);
    return 0;
  }
  console.log(formatWhatCanIDo(workflowViews(toolNames)));
  return 0;
}

async function runProofCommand(rest: string[], dataDir: string, toolNames: string[]): Promise<number | null> {
  if (rest[0] === "--check") {
    const result = runColdActivationCheck(toolNames);
    console.log(result.output);
    return result.ok ? 0 : 1;
  }
  if (rest[0] === "--fresh-workspace-check") {
    const proof = await runFreshWorkspaceActivationProof(dataDir, () => runColdActivationCheck(toolNames));
    console.log(proof.output);
    return proof.ok ? 0 : 1;
  }
  if (rest[0] === "--fresh-context-review") {
    const proof = await runFreshContextActivationReview(dataDir, workflowViews(toolNames), () => runColdActivationCheck(toolNames));
    console.log(proof.output);
    return proof.ok ? 0 : 1;
  }
  if (rest[0] === "--review-packet") {
    console.log(formatFreshActivationReviewPacket(workflowViews(toolNames)));
    return 0;
  }
  return null;
}
