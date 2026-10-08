import { join } from "node:path";
import { bootstrapKernel } from "../session/bootstrap-kernel.js";
import { prepareSessionCapabilities } from "../session/capability-setup.js";
import { capabilitySnapshot } from "../agent/capability-snapshot.js";
import { redactForLog } from "../store/redact-structural.js";
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
  let prepared: Awaited<ReturnType<typeof prepareSessionCapabilities>>;
  try { prepared = await prepareSessionCapabilities(process.cwd(), await bootstrapKernel(process.cwd())); }
  catch (error) {
    console.log(`What Vanta can do now\nSetup required: ${redactForLog(error instanceof Error ? error.message : "session unavailable")}\nRepair the selected provider or local kernel in setup; no callable registry was established.`);
    return 1;
  }
  try { return await renderLiveGallery(rest, dataDir, capabilitySnapshot(prepared.registry.schemas())); }
  finally { prepared.dispose(); }
}

async function renderLiveGallery(rest: string[], dataDir: string, snapshot: ReturnType<typeof capabilitySnapshot>): Promise<number> {
  const toolNames = snapshot.exposed.map((schema) => schema.name);
  const proofCode = await runProofCommand(rest, dataDir, toolNames);
  if (proofCode !== null) return proofCode;
  const reviewText = recordReviewText(rest);
  if (reviewText) {
    const file = await recordFreshActivationReview(dataDir, { reviewer: "fresh-context", confusion: reviewText });
    console.log(`  ✓ fresh-context review recorded → ${file}`);
    return 0;
  }
  console.log(formatWhatCanIDo(workflowViews(toolNames), snapshot));
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
