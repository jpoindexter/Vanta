import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ColdActivationResult, WorkflowView } from "./what-can-i-do-cmd.js";

export type FreshActivationReview = {
  reviewer: string;
  confusion: string;
  createdAt: string;
  workflowId?: string;
};

export type FreshWorkspaceActivationProof = {
  workspace: string;
  vantaHome: string;
  result: ColdActivationResult;
  createdAt: string;
};

export function formatFreshActivationReviewPacket(views: WorkflowView[]): string {
  const rows = views.map((v, i) => `  ${i + 1}. [${v.state}] ${v.title} — ${v.outcome}`);
  return [
    "Fresh-context activation review packet",
    "Reviewer stance: assume you have never seen this repo or Vanta's internals.",
    "",
    "Task",
    "  1. Run `vanta what-can-i-do` or type `/what-can-i-do` in Vanta.",
    "  2. Pick the first workflow that sounds useful without reading docs.",
    "  3. Try its demo or check path: `vanta what-can-i-do --check`.",
    "  4. Record the first confusion point, even if the run succeeds.",
    "",
    "Record",
    "  vanta what-can-i-do --record-review \"<first confusion point>\"",
    "  or: /what-can-i-do --record-review <first confusion point>",
    "",
    "Visible workflows",
    ...rows,
  ].join("\n");
}

export function buildFreshActivationReviewRecord(review: FreshActivationReview): string {
  return [
    "# Fresh-Context Activation Review",
    "",
    `- Reviewer: ${review.reviewer}`,
    `- Created: ${review.createdAt}`,
    review.workflowId ? `- Workflow: ${review.workflowId}` : "- Workflow: not recorded",
    "",
    "## First Confusion Point",
    "",
    review.confusion,
    "",
    "## Blocking Fix Required",
    "",
    "Treat this as blocking if it prevents a cold reviewer from reaching one useful workflow without knowing internal Vanta command names.",
  ].join("\n");
}

export async function recordFreshActivationReview(
  dataDir: string,
  review: Omit<FreshActivationReview, "createdAt">,
  now: () => Date = () => new Date(),
): Promise<string> {
  const createdAt = now().toISOString();
  const safeTs = createdAt.replace(/[:.]/g, "-");
  const dir = join(dataDir, "activation-reviews");
  const file = join(dir, `fresh-context-${safeTs}.md`);
  await mkdir(dir, { recursive: true });
  await writeFile(file, `${buildFreshActivationReviewRecord({ ...review, createdAt })}\n`, "utf8");
  return file;
}

export function buildFreshWorkspaceProof(proof: FreshWorkspaceActivationProof): string {
  return [
    "# Fresh-Workspace Activation Proof",
    "",
    `- Created: ${proof.createdAt}`,
    `- Workspace: ${proof.workspace}`,
    `- VANTA_HOME: ${proof.vantaHome}`,
    `- Result: ${proof.result.ok ? "PASS" : "FAIL"}`,
    proof.result.workflowTitle ? `- Picked: ${proof.result.workflowTitle}` : "- Picked: none",
    `- Time-to-first-useful-action: ${proof.result.elapsedMs}ms`,
    "",
    "## Output",
    "",
    "```",
    proof.result.output,
    "```",
  ].join("\n");
}

export async function runFreshWorkspaceActivationProof(
  dataDir: string,
  runCheck: () => ColdActivationResult,
  now: () => Date = () => new Date(),
): Promise<{ ok: boolean; file: string; output: string }> {
  const workspace = await mkdtemp(join(tmpdir(), "vanta-fresh-workspace-"));
  const vantaHome = await mkdtemp(join(tmpdir(), "vanta-fresh-home-"));
  const result = runCheck();
  const createdAt = now().toISOString();
  const dir = join(dataDir, "activation-reviews");
  const file = join(dir, `fresh-workspace-${createdAt.replace(/[:.]/g, "-")}.md`);
  await mkdir(dir, { recursive: true });
  await writeFile(file, `${buildFreshWorkspaceProof({ workspace, vantaHome, result, createdAt })}\n`, "utf8");
  return {
    ok: result.ok,
    file,
    output: [
      result.ok ? "Fresh-workspace activation proof: PASS" : "Fresh-workspace activation proof: FAIL",
      `Evidence: ${file}`,
      "",
      result.output,
    ].join("\n"),
  };
}
