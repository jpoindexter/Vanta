import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BETA_PATHS, runBetaProof, formatBetaReport, type BetaPath } from "../verify/beta-proof.js";
import { ensureKernel } from "../kernel-launcher.js";
import { kernelBinaryPath } from "../kernel/path.js";
import { createKernelClient } from "../kernel/client.js";
import { parsePipeline, runPipeline } from "../workflow/rpc-pipeline.js";
import { createConversation } from "../agent.js";
import { prepareRun, buildSummarizer } from "../session.js";
import type { Message } from "../types.js";

// BETA-LIVE-PROOF — `vanta beta-proof`: run the headless-provable beta paths live
// (kernel blocks a destructive action; a multi-step pipeline collapses to one
// turn; a provider is configured), record the proven-vs-gated evidence to
// docs/beta-readiness.md, and exit non-zero if a provable path failed.

type Check = { ok: boolean; evidence: string };

async function checkSafe(repoRoot: string): Promise<Check> {
  const configuredUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  const baseUrl = await ensureKernel({ baseUrl: configuredUrl, kernelBin: kernelBinaryPath(repoRoot), root: repoRoot });
  const verdict = await createKernelClient(baseUrl).assess("rm -rf / --no-preserve-root");
  return { ok: verdict.risk === "block", evidence: `kernel verdict for 'rm -rf /' = ${verdict.risk} (expect block)` };
}

async function checkMultiStep(): Promise<Check> {
  const parsed = parsePipeline({
    steps: [
      { tool: "fetch", args: {}, assignTo: "raw" },
      { tool: "transform", args: { in: "$raw" }, assignTo: "clean" },
      { tool: "write", args: { content: "{{clean}}" } },
    ],
  });
  if (!parsed.ok) return { ok: false, evidence: parsed.error };
  let calls = 0;
  const run = await runPipeline(parsed.pipeline, {
    callTool: async (t) => { calls++; return { ok: true, output: `${t}-out` }; },
  });
  if (!run.ok) return { ok: false, evidence: `pipeline step ${run.failedStep + 1} failed: ${run.error}` };
  const onlyFinal = run.result.output === "write-out";
  return { ok: calls === 3 && onlyFinal, evidence: `${calls} tools ran in one turn; only the final result returned (${onlyFinal})` };
}

export function assessTaskProof(finalText: string, messages: Message[], iterations: number, stoppedReason: string): Check {
  const read = messages.find((message) => message.role === "tool" && message.name === "read_file" && message.content.includes("# Vanta"));
  const marker = finalText.includes("VANTA_BETA_TASK_OK") && finalText.includes("# Vanta");
  const ok = Boolean(read) && marker && stoppedReason === "done";
  return { ok, evidence: `real README task: read_file=${Boolean(read)}, contract=${marker}, stopped=${stoppedReason}, iterations=${iterations}` };
}

async function checkDoesATask(repoRoot: string): Promise<Check> {
  const instruction = "Read README.md with read_file. Do not modify files. Reply with exactly two lines: VANTA_BETA_TASK_OK and # Vanta.";
  const setup = await prepareRun(repoRoot, instruction);
  const convo = createConversation(setup.systemPrompt, {
    provider: setup.provider, safety: setup.safety, registry: setup.registry, root: repoRoot,
    requestApproval: async () => false, maxIterations: 8, summarize: buildSummarizer(setup.provider),
  });
  const outcome = await convo.send(instruction);
  return assessTaskProof(outcome.finalText, convo.messages, outcome.iterations, outcome.stoppedReason);
}

async function runCheck(p: BetaPath, repoRoot: string): Promise<Check> {
  if (p.id === "safe") return checkSafe(repoRoot);
  if (p.id === "multi-step") return checkMultiStep();
  if (p.id === "does-a-task") return checkDoesATask(repoRoot);
  return { ok: false, evidence: "no live check wired for this path" };
}

export async function runBetaProofCommand(repoRoot: string, now: Date = new Date()): Promise<number> {
  const report = await runBetaProof(BETA_PATHS, { run: (p) => runCheck(p, repoRoot) });
  const md = formatBetaReport(report, now.toISOString().slice(0, 10));
  const out = join(repoRoot, "docs", "beta-readiness.md");
  await writeFile(out, md + "\n", "utf8");
  console.log(md);
  console.log(`\nrecorded → ${out}`);
  return report.ready ? 0 : 1;
}
