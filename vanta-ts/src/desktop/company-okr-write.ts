import type { z } from "zod";
import { addObjective, getObjective, readObjectives, updateKeyResult, writeObjectives } from "../cofounder/okr.js";
import { readDepartments } from "../cofounder/department.js";
import { recordActivity } from "./company-activity.js";
import { fail, succeed, type CompanyCtx, type Outcome } from "./company-context.js";
import { type ObjectiveView, objectiveView } from "./company-okrs.js";
import type { CreateOkrBody, OkrProgressBody } from "./company-write-schemas.js";

// OKR writes. Thin over the cofounder OKR model (pure addObjective / updateKeyResult)
// and its store (~/.vanta/okrs.json). Callers hold the company lock.

export type OkrWrite = { objective: ObjectiveView; changed: boolean };

const BAD_REQUEST = 400;
const NOT_FOUND = 404;

export async function createObjective(ctx: CompanyCtx, body: z.infer<typeof CreateOkrBody>): Promise<Outcome<OkrWrite>> {
  if (body.departmentId && !(await readDepartments(ctx.env)).some((d) => d.id === body.departmentId)) {
    return fail(BAD_REQUEST, `departmentId "${body.departmentId}" is not a department. Leave it out or create one with vanta dept add.`);
  }
  const existing = await readObjectives(ctx.env);
  const made = addObjective(existing, { title: body.title, departmentId: body.departmentId, keyResults: body.keyResults }, ctx.ports.now());
  if (!made.ok) return fail(BAD_REQUEST, made.error);
  await writeObjectives([...existing, made.value], ctx.env);
  await recordActivity(ctx, { kind: "okr.created", actor: "owner", summary: `created objective "${made.value.title}" with ${made.value.keyResults.length} key result(s)`, refs: {} });
  return succeed({ objective: objectiveView(made.value), changed: true });
}

export async function setKeyResultProgress(ctx: CompanyCtx, body: z.infer<typeof OkrProgressBody>): Promise<Outcome<OkrWrite>> {
  const existing = await readObjectives(ctx.env);
  if (!getObjective(existing, body.objectiveId)) return fail(NOT_FOUND, `no objective "${body.objectiveId}". GET /api/okrs lists them.`);
  const updated = updateKeyResult(existing, { objectiveId: body.objectiveId, name: body.name, current: body.current, target: body.target }, ctx.ports.now());
  if (!updated.ok) return fail(BAD_REQUEST, `${updated.error}. Send target to add a new key result.`);
  await writeObjectives(updated.value, ctx.env);
  const objective = getObjective(updated.value, body.objectiveId)!;
  await recordActivity(ctx, { kind: "okr.progress", actor: "owner", summary: `set "${body.name}" to ${body.current} on "${objective.title}"`, refs: {} });
  return succeed({ objective: objectiveView(objective), changed: true });
}
