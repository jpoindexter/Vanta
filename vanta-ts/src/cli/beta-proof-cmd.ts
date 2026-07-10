import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BETA_PATHS, runBetaProof, formatBetaReport, type BetaPath } from "../verify/beta-proof.js";
import { ensureKernel } from "../kernel-launcher.js";
import { kernelBinaryPath } from "../kernel/path.js";
import { createKernelClient } from "../kernel/client.js";
import { parsePipeline, runPipeline } from "../workflow/rpc-pipeline.js";
import { resolveProvider } from "../providers/index.js";

// BETA-LIVE-PROOF — `vanta beta-proof`: run the headless-provable beta paths live
// (kernel blocks a destructive action; a multi-step pipeline collapses to one
// turn; a provider is configured), record the proven-vs-gated evidence to
// docs/beta-readiness.md, and exit non-zero if a provable path failed.

type Check = { ok: boolean; evidence: string };

async function checkSafe(repoRoot: string): Promise<Check> {
  const baseUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  await ensureKernel({ baseUrl, kernelBin: kernelBinaryPath(repoRoot), root: repoRoot });
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

function checkDoesATask(): Check {
  try {
    const p = resolveProvider(process.env);
    return { ok: true, evidence: `a provider is configured: ${p.modelId()}` };
  } catch (e) {
    return { ok: false, evidence: `no provider configured — run 'vanta setup' (${e instanceof Error ? e.message : String(e)})` };
  }
}

async function runCheck(p: BetaPath, repoRoot: string): Promise<Check> {
  if (p.id === "safe") return checkSafe(repoRoot);
  if (p.id === "multi-step") return checkMultiStep();
  if (p.id === "does-a-task") return checkDoesATask();
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
