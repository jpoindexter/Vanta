import { dataDirFor, buildCronRunTask } from "./ops.js";
import { enqueueJob, listJobs, type Job } from "../runner/queue.js";
import { runRunnerLoop, type ExecuteJob } from "../runner/loop.js";
import { buildAgentInvocation, runExternalAgent } from "../agents/external-cli.js";

// VANTA-SELF-HOSTED — `vanta runner`: a dedicated non-REPL entrypoint for
// CI/CD. `add` enqueues a job; `start` polls the queue and executes each job —
// as a Vanta one-shot run (kernel-gated, same path as cron) or, when the job
// names an external agent (e.g. "claude"), as an external agent session.
// `--once` drains and exits (the pipeline mode); default polls forever.

/** Execute one job: external agent session when `job.agent` is set, else Vanta. */
function buildExecutor(repoRoot: string): ExecuteJob {
  return async (job: Job) => {
    if (job.agent) {
      const inv = buildAgentInvocation(job.agent, job.instruction, { coding: true });
      if (!inv) return { ok: false, result: `unknown/unconfigured agent "${job.agent}"` };
      const r = await runExternalAgent(inv, { cwd: repoRoot, onChunk: (l) => console.log(`  ⋯ ${job.agent}: ${l}`) });
      return { ok: r.ok, result: r.ok ? r.stdout.trim() : `exit ${r.code}: ${(r.stderr || r.stdout).trim()}` };
    }
    const run = buildCronRunTask(repoRoot);
    const { finalText } = await run(job.instruction);
    return { ok: true, result: finalText };
  };
}

function parseStartFlags(rest: string[]): { once: boolean; intervalMs: number } {
  const once = rest.includes("--once");
  const idx = rest.indexOf("--interval");
  const sec = idx >= 0 ? Number(rest[idx + 1]) : NaN;
  return { once, intervalMs: Number.isFinite(sec) && sec > 0 ? sec * 1000 : 5000 };
}

async function runAdd(dataDir: string, rest: string[]): Promise<number> {
  const idx = rest.indexOf("--agent");
  const agent = idx >= 0 ? rest[idx + 1] : undefined;
  const words = idx >= 0 ? [...rest.slice(0, idx), ...rest.slice(idx + 2)] : rest;
  const instruction = words.join(" ").trim();
  if (!instruction) {
    console.error('usage: vanta runner add "<instruction>" [--agent claude|codex|…]');
    return 1;
  }
  const job = await enqueueJob(dataDir, { instruction, agent });
  console.log(`queued ${job.id}${job.agent ? ` (agent: ${job.agent})` : ""} — ${job.instruction}`);
  return 0;
}

async function runList(dataDir: string): Promise<number> {
  const jobs = await listJobs(dataDir);
  if (!jobs.length) {
    console.log("(no runner jobs)");
    return 0;
  }
  for (const j of jobs) {
    const tail = j.result ? ` → ${j.result.split("\n")[0]?.slice(0, 80)}` : "";
    console.log(`${j.id} [${j.status}]${j.agent ? ` (${j.agent})` : ""} ${j.instruction.slice(0, 60)}${tail}`);
  }
  return 0;
}

export async function runRunnerCommand(repoRoot: string, rest: string[]): Promise<number> {
  const dataDir = dataDirFor(repoRoot);
  const sub = rest[0] ?? "start";
  if (sub === "add") return runAdd(dataDir, rest.slice(1));
  if (sub === "list") return runList(dataDir);
  if (sub === "start") {
    const { once, intervalMs } = parseStartFlags(rest.slice(1));
    console.log(`vanta runner: polling ${once ? "(once)" : `every ${intervalMs / 1000}s`} — jobs in .vanta/runner-jobs/queued/`);
    const ran = await runRunnerLoop({ dataDir, execute: buildExecutor(repoRoot), once, intervalMs, log: (m) => console.log(m) });
    console.log(`vanta runner: executed ${ran} job(s)`);
    return 0;
  }
  console.error("usage: vanta runner [start [--once] [--interval <sec>] | add \"<instruction>\" [--agent <cli>] | list]");
  return 1;
}
