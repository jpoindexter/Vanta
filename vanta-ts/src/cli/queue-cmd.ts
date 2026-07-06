import { dataDirFor } from "./ops.js";
import { defineQueue, loadQueue, listQueues, renderInstruction, queueSubdir, type WorkQueue } from "../queues/work-queue.js";
import { enqueueJob, listJobs, type Job } from "../runner/queue.js";
import { runRunnerLoop, type ExecuteJob } from "../runner/loop.js";

// PCLIP-WORK-QUEUES — `vanta queue`: define a named queue routed to a team
// worker, push repeated inputs, and work the queue: every item becomes a REAL
// team-ledger task assigned to that worker and runs through the same worker
// executor as `team run` (subagent with the teammate model, kernel-gated).

/** Per-item route: ledger task assigned to the queue's worker → team doRun. */
function buildQueueExecutor(repoRoot: string, queue: WorkQueue): ExecuteJob {
  return async (job: Job) => {
    const [{ prepareRun }, teamRun, tasks] = await Promise.all([
      import("../session.js"),
      import("../tools/team-run.js"),
      import("../team/tasks.js"),
    ]);
    const instruction = renderInstruction(queue, job.instruction);
    const taskId = `q-${queue.name}-${job.id}`;
    const assigned = tasks.assignTask(await tasks.readTasks(), taskId, queue.workerId, instruction.slice(0, 120));
    if (!assigned.ok) return { ok: false, result: assigned.error };
    await tasks.appendTask(assigned.value);
    const setup = await prepareRun(repoRoot, instruction);
    const ctx = { root: repoRoot, safety: setup.safety, requestApproval: async () => false };
    const r = await teamRun.doRun(taskId, instruction, ctx);
    return { ok: r.ok, result: r.output };
  };
}

async function runDefine(dataDir: string, rest: string[]): Promise<number> {
  const name = rest[0];
  const wIdx = rest.indexOf("--worker");
  const tIdx = rest.indexOf("--template");
  const workerId = wIdx >= 0 ? rest[wIdx + 1] : undefined;
  if (!name || !workerId) {
    console.error('usage: vanta queue define <name> --worker <workerId> [--template "… {input} …"]');
    return 1;
  }
  const q = await defineQueue(dataDir, { name, workerId, template: tIdx >= 0 ? rest[tIdx + 1] : undefined });
  if ("error" in q) {
    console.error(q.error);
    return 1;
  }
  console.log(`queue "${q.name}" → worker ${q.workerId} · template: ${q.template}`);
  return 0;
}

async function runPush(dataDir: string, rest: string[]): Promise<number> {
  const name = rest[0];
  const input = rest.slice(1).join(" ").trim();
  if (!name || !input) {
    console.error('usage: vanta queue push <name> "<input>"');
    return 1;
  }
  if (!(await loadQueue(dataDir, name))) {
    console.error(`unknown queue "${name}" — define it first (vanta queue define)`);
    return 1;
  }
  const job = await enqueueJob(dataDir, { instruction: input, subdir: queueSubdir(name) });
  console.log(`queued ${job.id} on "${name}" — ${input.slice(0, 80)}`);
  return 0;
}

async function runWork(repoRoot: string, dataDir: string, rest: string[]): Promise<number> {
  const name = rest[0];
  const queue = name ? await loadQueue(dataDir, name) : null;
  if (!queue) {
    console.error(`unknown queue "${name ?? ""}" — define it first (vanta queue define)`);
    return 1;
  }
  const once = rest.includes("--once");
  console.log(`vanta queue: working "${queue.name}" → worker ${queue.workerId} ${once ? "(once)" : "(polling)"}`);
  const ran = await runRunnerLoop({
    dataDir,
    subdir: queueSubdir(queue.name),
    execute: buildQueueExecutor(repoRoot, queue),
    once,
    log: (m) => console.log(m),
  });
  console.log(`vanta queue: executed ${ran} item(s)`);
  return 0;
}

async function runList(dataDir: string): Promise<number> {
  const queues = await listQueues(dataDir);
  if (!queues.length) {
    console.log("(no work queues — vanta queue define <name> --worker <id>)");
    return 0;
  }
  for (const q of queues) {
    const items = await listJobs(dataDir, { subdir: queueSubdir(q.name) });
    const counts = ["queued", "running", "done", "failed"]
      .map((s) => `${items.filter((i) => i.status === s).length} ${s}`)
      .join(" · ");
    console.log(`${q.name} → ${q.workerId} · ${counts}`);
  }
  return 0;
}

export async function runQueueCommand(repoRoot: string, rest: string[]): Promise<number> {
  const dataDir = dataDirFor(repoRoot);
  const sub = rest[0] ?? "list";
  if (sub === "define") return runDefine(dataDir, rest.slice(1));
  if (sub === "push") return runPush(dataDir, rest.slice(1));
  if (sub === "work") return runWork(repoRoot, dataDir, rest.slice(1));
  if (sub === "list") return runList(dataDir);
  console.error('usage: vanta queue [define <name> --worker <id> [--template "…{input}…"] | push <name> "<input>" | work <name> [--once] | list]');
  return 1;
}
