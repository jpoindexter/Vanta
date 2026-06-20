import type { FleetReport, FleetWorker } from "../fleet/types.js";

// VANTA-SKILL-BATCH — the PR-workflow layer over the parallel worker fleet.
// `vanta batch` reuses fleet's worktree-isolated workers, then opens one PR per
// COMPLETED worker and reports the URLs. The test gate is structural: a worker
// only reaches `done` if it satisfied the test directive appended to its task;
// a `blocked` worker (e.g. tests it couldn't fix) gets no PR. The gh/git calls
// are injected — the pure arg-builders/parsers are unit-tested; the live needs
// (gh CLI authed + a remote) are the documented boundary.

export type GhRunner = (args: string[], cwd: string) => Promise<{ ok: boolean; stdout: string; stderr: string }>;
export type Pusher = (branch: string, cwd: string) => Promise<{ ok: boolean; stderr: string }>;
export type BatchPrResult = { workerId: string; title: string; branch: string; url?: string; error?: string };

const TEST_GATE =
  "Before finishing, run the project's test suite and FIX any failures — do not finish with failing tests.";

/** Append the test gate so a worker only reaches `done` with green tests. Pure. */
export function buildBatchInstruction(instruction: string): string {
  return `${instruction}\n\n${TEST_GATE}`;
}

/** Workers eligible for a PR: only those that completed (`done`). Pure. */
export function prCandidates(report: FleetReport): FleetWorker[] {
  return report.workers.filter((w) => w.status === "done");
}

/** `gh pr create` argv for a worker's branch. Pure. */
export function buildGhPrArgs(worker: FleetWorker, base: string): string[] {
  const body = `Automated by \`vanta batch\` (worker ${worker.id}).\n\nTask: ${worker.title}`;
  return ["pr", "create", "--head", worker.branch, "--base", base, "--title", worker.title, "--body", body];
}

/** The PR URL gh prints (the last http(s) token). Pure. */
export function parsePrUrl(stdout: string): string | null {
  const urls = stdout.split(/\s+/).filter((t) => /^https?:\/\//.test(t));
  return urls.length ? (urls[urls.length - 1] ?? null) : null;
}

/** Open one PR per completed worker: push the branch, then create the PR — both
 *  via the injected runner. A push or create failure is recorded, not thrown. */
export async function createBatchPrs(
  report: FleetReport,
  base: string,
  deps: { gh: GhRunner; push: Pusher; cwd: string },
): Promise<BatchPrResult[]> {
  const out: BatchPrResult[] = [];
  for (const w of prCandidates(report)) {
    const head: BatchPrResult = { workerId: w.id, title: w.title, branch: w.branch };
    const pushed = await deps.push(w.branch, deps.cwd);
    if (!pushed.ok) {
      out.push({ ...head, error: `push failed: ${pushed.stderr}` });
      continue;
    }
    const r = await deps.gh(buildGhPrArgs(w, base), deps.cwd);
    out.push(r.ok ? { ...head, url: parsePrUrl(r.stdout) ?? undefined } : { ...head, error: r.stderr || "gh pr create failed" });
  }
  return out;
}

/** Coordinator summary: PR URLs + any per-worker failures. Pure. */
export function formatBatchReport(report: FleetReport, prs: BatchPrResult[]): string {
  const made = prs.filter((p) => p.url).length;
  const lines = [`batch ${report.id}: ${report.workers.length} worker(s), ${made} PR(s) opened`];
  for (const w of report.workers) {
    const pr = prs.find((p) => p.workerId === w.id);
    const tail = pr?.url ? `→ ${pr.url}` : pr?.error ? `→ PR failed: ${pr.error}` : `[${w.status}]`;
    lines.push(`  • ${w.title} ${tail}`);
  }
  return lines.join("\n");
}
