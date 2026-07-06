import { mkdir, readFile, writeFile, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

// VANTA-SELF-HOSTED — the CI/CD job queue. One JSON file per job under
// `.vanta/runner-jobs/{queued,running,done}/`. Claiming = an atomic rename
// queued→running, so two runner processes polling the same queue never execute
// the same job (same primitive class as cron-cas). External systems enqueue by
// dropping a `{id?, instruction, agent?}` JSON file into `queued/`.

export const JobSchema = z.object({
  id: z.string().min(1),
  instruction: z.string().min(1),
  /** External agent CLI to run the job with (e.g. "claude"); absent = Vanta itself. */
  agent: z.string().optional(),
  status: z.enum(["queued", "running", "done", "failed"]).default("queued"),
  result: z.string().optional(),
  created: z.string(),
  updated: z.string(),
});
export type Job = z.infer<typeof JobSchema>;

const DIRS = ["queued", "running", "done"] as const;
type JobDir = (typeof DIRS)[number];

// PCLIP-WORK-QUEUES generalization: the atomic-claim primitives serve any
// queue directory — the self-hosted runner uses the default "runner-jobs",
// named work queues pass `subdir: "work-queues/<name>"`.
const DEFAULT_SUBDIR = "runner-jobs";

export type QueueLoc = { subdir?: string };

export function runnerDir(dataDir: string, loc: QueueLoc = {}): string {
  return join(dataDir, loc.subdir ?? DEFAULT_SUBDIR);
}

function dirFor(dataDir: string, d: JobDir, loc: QueueLoc = {}): string {
  return join(runnerDir(dataDir, loc), d);
}

async function ensureDirs(dataDir: string, loc: QueueLoc = {}): Promise<void> {
  for (const d of DIRS) await mkdir(dirFor(dataDir, d, loc), { recursive: true });
}

async function writeJob(dataDir: string, d: JobDir, job: Job, loc: QueueLoc = {}): Promise<void> {
  await writeFile(join(dirFor(dataDir, d, loc), `${job.id}.json`), `${JSON.stringify(job, null, 2)}\n`, "utf8");
}

/** Enqueue a job (id defaults to a timestamp-random slug). */
export async function enqueueJob(
  dataDir: string,
  opts: { instruction: string; agent?: string; id?: string; now?: Date } & QueueLoc,
): Promise<Job> {
  await ensureDirs(dataDir, opts);
  const now = (opts.now ?? new Date()).toISOString();
  const id = opts.id ?? `job-${now.replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 6)}`;
  const job: Job = { id, instruction: opts.instruction, agent: opts.agent, status: "queued", created: now, updated: now };
  await writeJob(dataDir, "queued", job, opts);
  return job;
}

/** Read + validate one job file; null on a malformed file (skipped, not fatal). */
async function readJob(path: string): Promise<Job | null> {
  try {
    const parsed = JobSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Claim the oldest queued job by atomically renaming it into `running/`.
 * A lost race (another process claimed it first) moves on to the next file.
 * Returns null when the queue is empty.
 */
export async function claimNextJob(dataDir: string, now: Date = new Date(), loc: QueueLoc = {}): Promise<Job | null> {
  await ensureDirs(dataDir, loc);
  const files = (await readdir(dirFor(dataDir, "queued", loc))).filter((f) => f.endsWith(".json")).sort();
  for (const f of files) {
    const from = join(dirFor(dataDir, "queued", loc), f);
    const to = join(dirFor(dataDir, "running", loc), f);
    try {
      await rename(from, to); // atomic claim — loser of the race gets ENOENT
    } catch {
      continue;
    }
    const job = await readJob(to);
    if (!job) continue; // malformed file: leave it in running/ for inspection
    const claimed: Job = { ...job, status: "running", updated: now.toISOString() };
    await writeJob(dataDir, "running", claimed, loc);
    return claimed;
  }
  return null;
}

/** Post a claimed job's result back: move running/ → done/ with status+result. */
export async function completeJob(
  dataDir: string,
  job: Job,
  outcome: { ok: boolean; result: string; now?: Date } & QueueLoc,
): Promise<Job> {
  const finished: Job = {
    ...job,
    status: outcome.ok ? "done" : "failed",
    result: outcome.result,
    updated: (outcome.now ?? new Date()).toISOString(),
  };
  await writeJob(dataDir, "done", finished, outcome);
  await rm(join(dirFor(dataDir, "running", outcome), `${job.id}.json`), { force: true });
  return finished;
}

/** All jobs across the three states (for `vanta runner list`). */
export async function listJobs(dataDir: string, loc: QueueLoc = {}): Promise<Job[]> {
  await ensureDirs(dataDir, loc);
  const out: Job[] = [];
  for (const d of DIRS) {
    for (const f of (await readdir(dirFor(dataDir, d, loc))).filter((x) => x.endsWith(".json")).sort()) {
      const job = await readJob(join(dirFor(dataDir, d, loc), f));
      if (job) out.push(job);
    }
  }
  return out;
}
