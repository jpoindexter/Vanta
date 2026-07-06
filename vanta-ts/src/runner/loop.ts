import { claimNextJob, completeJob, type Job } from "./queue.js";

// VANTA-SELF-HOSTED — the runner loop: poll the queue, claim, execute, post the
// result back, repeat. The executor is injected (Vanta one-shot run or an
// external agent CLI — wired in cli/runner-cmd.ts) so the loop is testable
// without a provider. `once` drains the queue and exits — the CI/CD mode.

export type ExecuteJob = (job: Job) => Promise<{ ok: boolean; result: string }>;

export type RunnerLoopOpts = {
  dataDir: string;
  execute: ExecuteJob;
  /** Drain the queue once and return (CI mode). False = poll forever. */
  once?: boolean;
  /** Poll interval in ms when idle (default 5000). */
  intervalMs?: number;
  /** Stop after this many jobs (safety bound; default unbounded). */
  maxJobs?: number;
  log?: (msg: string) => void;
  /** Injected sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Claim + execute + post back one job. Returns false when the queue was empty. */
async function runOneJob(opts: RunnerLoopOpts): Promise<boolean> {
  const log = opts.log ?? (() => {});
  const job = await claimNextJob(opts.dataDir);
  if (!job) return false;
  log(`runner: ${job.id} started — ${job.instruction.slice(0, 80)}`);
  let outcome: { ok: boolean; result: string };
  try {
    outcome = await opts.execute(job);
  } catch (err) {
    outcome = { ok: false, result: `error: ${err instanceof Error ? err.message : String(err)}` };
  }
  await completeJob(opts.dataDir, job, outcome);
  log(`runner: ${job.id} ${outcome.ok ? "done" : "FAILED"}`);
  return true;
}

/**
 * The job-polling loop. Executes queued jobs oldest-first; a failing job is
 * posted back as `failed` and never stops the loop. Returns the number of jobs
 * executed (meaningful for `once`/`maxJobs`; the forever mode only returns
 * when `maxJobs` is hit).
 */
export async function runRunnerLoop(opts: RunnerLoopOpts): Promise<number> {
  const sleep = opts.sleep ?? defaultSleep;
  const intervalMs = opts.intervalMs ?? 5000;
  let ran = 0;
  for (;;) {
    const didRun = await runOneJob(opts);
    if (didRun) {
      ran += 1;
      if (opts.maxJobs !== undefined && ran >= opts.maxJobs) return ran;
      continue; // drain back-to-back without sleeping
    }
    if (opts.once) return ran;
    await sleep(intervalMs);
  }
}
