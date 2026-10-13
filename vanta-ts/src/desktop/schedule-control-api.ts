import { randomUUID } from "node:crypto";
import { z } from "zod";
import { dataDirFor } from "../cli/ops.js";
import { addCron, isValidCron, loadCron, removeCron, scriptAuthorityValid, scriptSha256, type CronEntry } from "../schedule/cron.js";
import { isScriptMode, scriptOf, updateCron, type CronPatch } from "../schedule/cron-edit.js";
import { parseNaturalInterval } from "../schedule/natural-interval.js";
import {
  type ControlCtx, type ControlTable, approveExactAction, parseBody, sendFail, sendOk,
} from "./control-http.js";

const Id = z.number().int().positive();
const When = { cron: z.string().trim().min(1).optional(), when: z.string().trim().min(1).max(200).optional() };
const CreateBody = z.object({
  ...When,
  instruction: z.string().trim().min(1).max(8000),
  mode: z.enum(["no_agent", "script_context"]).optional(),
  script: z.string().trim().min(1).max(8000).optional(),
  routine: z.enum(["skip", "once"]).optional(),
});
const UpdateBody = z.object({ id: Id, ...When, instruction: z.string().trim().min(1).max(8000).optional(), script: z.string().trim().min(1).max(8000).optional() });
const IdBody = z.object({ id: Id });

type Handler = ControlTable[string];

/** A five-field cron, or a natural phrase such as "every 2 hours" / "daily at 9:00". */
export function resolveCron(input: { cron?: string; when?: string }): { cron: string } | { error: string } {
  if (input.cron) return isValidCron(input.cron) ? { cron: input.cron.trim() } : { error: `cron must have 5 valid fields, got "${input.cron}"` };
  if (!input.when) return { error: "cron or when is required" };
  const parsed = parseNaturalInterval(`${input.when} task`);
  return "error" in parsed ? { error: parsed.error } : { cron: parsed.cron };
}

function newAuthority(script: string): { scriptSha256: string; authorityId: string } {
  return { scriptSha256: scriptSha256(script), authorityId: `operator-desktop:${randomUUID()}` };
}

function scriptApproval(ctx: ControlCtx, what: string, cron: string, script: string): Promise<boolean> {
  return approveExactAction(ctx, {
    action: `${what} script on "${cron}": ${script}`,
    reason: "A scheduled script runs without asking again. Approving binds these exact bytes to the schedule.",
    toolName: "schedule_script",
  });
}

/** Finds an editable (file-backed) entry or answers 404/409 itself. */
async function editableEntry(ctx: ControlCtx, id: number): Promise<CronEntry | null> {
  const entry = (await loadCron(dataDirFor(ctx.state.root))).find((candidate) => candidate.id === id);
  if (!entry) { sendFail(ctx.res, 404, `schedule #${id} not found`); return null; }
  if ("durable" in entry) { sendFail(ctx.res, 409, `schedule #${id} is a durable agent task and is managed by the agent`); return null; }
  return entry;
}

/** The script a create request would run, or an error when the mode and script disagree. */
function createdScript(body: z.infer<typeof CreateBody>): { script?: string } | { error: string } {
  if (!body.mode) return {};
  const script = body.script ?? (body.mode === "no_agent" ? body.instruction : undefined);
  return script ? { script } : { error: "script_context needs a script" };
}

const create: Handler = async (ctx) => {
  const body = await parseBody(ctx, CreateBody);
  if (!body) return;
  const when = resolveCron(body);
  if ("error" in when) return sendFail(ctx.res, 400, when.error);
  const planned = createdScript(body);
  if ("error" in planned) return sendFail(ctx.res, 400, planned.error);
  const { script } = planned;
  if (script && !(await scriptApproval(ctx, "create", when.cron, script))) return;
  const entry = await addCron(dataDirFor(ctx.state.root), when.cron, body.instruction, {
    mode: body.mode, script: body.script, routine: body.routine, ...(script ? newAuthority(script) : {}),
  });
  sendOk(ctx.res, { schedule: entry });
};

function changedScript(entry: CronEntry, body: z.infer<typeof UpdateBody>): string | undefined {
  if (!isScriptMode(entry)) return undefined;
  const next = body.script ?? (entry.mode === "no_agent" ? body.instruction : undefined);
  return next !== undefined && next !== scriptOf(entry) ? next : undefined;
}

function hasUpdate(body: z.infer<typeof UpdateBody>): boolean {
  return [body.cron, body.when, body.instruction, body.script].some((value) => value !== undefined);
}

const update: Handler = async (ctx) => {
  const body = await parseBody(ctx, UpdateBody);
  if (!body) return;
  if (!hasUpdate(body)) return sendFail(ctx.res, 400, "nothing to update: send cron, when, instruction or script");
  const entry = await editableEntry(ctx, body.id);
  if (!entry) return;
  const patch: CronPatch = { instruction: body.instruction, script: body.script };
  const timing = body.cron !== undefined || body.when !== undefined ? resolveCron(body) : undefined;
  if (timing && "error" in timing) return sendFail(ctx.res, 400, timing.error);
  if (timing) patch.cron = timing.cron;
  const script = changedScript(entry, body);
  if (script !== undefined) {
    if (!(await scriptApproval(ctx, `change #${entry.id}`, patch.cron ?? entry.cron, script))) return;
    patch.authority = newAuthority(script);
  }
  sendOk(ctx.res, { schedule: await updateCron(dataDirFor(ctx.state.root), entry.id, patch) });
};

const pause: Handler = async (ctx) => {
  const body = await parseBody(ctx, IdBody);
  const entry = body && await editableEntry(ctx, body.id);
  if (!entry) return;
  sendOk(ctx.res, { schedule: await updateCron(dataDirFor(ctx.state.root), entry.id, { status: "paused" }) });
};

const resume: Handler = async (ctx) => {
  const body = await parseBody(ctx, IdBody);
  const entry = body && await editableEntry(ctx, body.id);
  if (!entry) return;
  const patch: CronPatch = { status: "active" };
  const script = isScriptMode(entry) ? scriptOf(entry) : undefined;
  if (isScriptMode(entry)) {
    if (!script) return sendFail(ctx.res, 409, `schedule #${entry.id} has no script to run`);
    if (!(await scriptApproval(ctx, `enable #${entry.id}`, entry.cron, script))) return;
    if (!scriptAuthorityValid(entry)) patch.authority = newAuthority(script);
  }
  sendOk(ctx.res, { schedule: await updateCron(dataDirFor(ctx.state.root), entry.id, patch) });
};

const remove: Handler = async (ctx) => {
  const body = await parseBody(ctx, IdBody);
  const entry = body && await editableEntry(ctx, body.id);
  if (!entry) return;
  await removeCron(dataDirFor(ctx.state.root), entry.id);
  sendOk(ctx.res, { id: entry.id });
};

export const scheduleControlPost: ControlTable = {
  "/api/schedules/create": create,
  "/api/schedules/update": update,
  "/api/schedules/pause": pause,
  "/api/schedules/resume": resume,
  "/api/schedules/delete": remove,
};
