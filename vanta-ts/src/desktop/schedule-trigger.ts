import { z } from "zod";
import { dataDirFor } from "../cli/ops.js";
import { loadCron, scriptAuthorityValid } from "../schedule/cron.js";
import { isScriptMode } from "../schedule/cron-edit.js";
import { listScheduleRuns, recordScheduleRun, runSucceeded } from "../schedule/run-log.js";
import { runOne, type RunScript, type RunTask } from "../schedule/runner.js";
import { saveSession } from "../sessions/store.js";
import {
  type ControlCtx, type ControlPattern, type ControlTable, errorText, parseBody, parseQuery, sendFail, sendOk,
} from "./control-http.js";
import { sendJson } from "./handler-http.js";

const IdBody = z.object({ id: z.number().int().positive() });
const RunsQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

export type ScheduleRunner = { run: RunTask; runScript: RunScript };
export type ScheduleRunnerFactory = (root: string) => Promise<ScheduleRunner>;

/** The same agent turn and effect-gated script runner `vanta cron` uses, built lazily. */
const productionRunner: ScheduleRunnerFactory = async (root) => {
  const [{ buildCronRunTask }, { createKernelClient }, { resolvePermissionMode }, { runScheduledScript }, { runCronScript }] = await Promise.all([
    import("../cli/ops.js"), import("../kernel/client.js"), import("../modes/permission-mode.js"),
    import("../schedule/effect-run.js"), import("../schedule/script-run.js"),
  ]);
  const context = {
    kernel: createKernelClient(process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788", root),
    projectRoot: root, sessionId: "cron:desktop", permissionMode: resolvePermissionMode(process.env),
  };
  return {
    run: buildCronRunTask(root),
    runScript: (script, entry) => runScheduledScript({ entry, script, context, windowKey: `manual-${Date.now()}`, run: runCronScript }),
  };
};

let factory: ScheduleRunnerFactory = productionRunner;
/** Tests swap the runner; pass null to restore the real one. */
export function setScheduleRunnerFactory(next: ScheduleRunnerFactory | null): void {
  factory = next ?? productionRunner;
}

async function runNow(ctx: ControlCtx, id: number): Promise<void> {
  const dataDir = dataDirFor(ctx.state.root);
  const entry = (await loadCron(dataDir)).find((candidate) => candidate.id === id);
  if (!entry) return sendFail(ctx.res, 404, `schedule #${id} not found`);
  if (isScriptMode(entry) && !scriptAuthorityValid(entry)) {
    return sendFail(ctx.res, 409, `schedule #${id} needs human authority for its current script; resume it to approve the script first`);
  }
  const now = new Date();
  const runner = await factory(ctx.state.root);
  const { createRoutineIssue } = await import("../schedule/commands.js");
  const outcome = await runOne(entry, now, runner.run, { runScript: runner.runScript, createIssue: (title) => createRoutineIssue(dataDir, title) });
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const sessionId = `sched-${id}-${stamp}`;
  await saveSession(sessionId, [{ role: "user", content: entry.instruction }, { role: "assistant", content: outcome.result }], { env: ctx.state._env ?? process.env, title: `Schedule #${id}: ${entry.instruction.slice(0, 50)}` });
  const run = await recordScheduleRun(dataDir, { jobId: id, at: now.toISOString(), trigger: "manual", ok: runSucceeded(outcome.result), summary: outcome.result, sessionId });
  sendOk(ctx.res, { run, result: outcome.result });
}

const trigger: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, IdBody);
  if (!body) return;
  try { await runNow(ctx, body.id); } catch (error) { sendFail(ctx.res, 500, `schedule #${body.id} could not run: ${errorText(error)}`); }
};

const runs: ControlTable[string] = async (ctx) => {
  const query = parseQuery(ctx, RunsQuery);
  if (!query) return;
  sendJson(ctx.res, 200, { runs: await listScheduleRuns(dataDirFor(ctx.state.root), Number(ctx.params[0]), query.limit) });
};

export const scheduleTriggerPost: ControlTable = { "/api/schedules/trigger": trigger };
export const scheduleRunsGetPatterns: ControlPattern[] = [[/^\/api\/schedules\/(\d+)\/runs$/, runs]];
