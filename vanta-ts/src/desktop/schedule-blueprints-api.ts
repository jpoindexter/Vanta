import { z } from "zod";
import { dataDirFor } from "../cli/ops.js";
import { applyAutomation } from "../automation-blueprints/runtime.js";
import { getAutomationBlueprint, listAutomationBlueprints } from "../automation-blueprints/catalog.js";
import { type ControlTable, errorText, parseBody, sendFail, sendOk } from "./control-http.js";
import { sendJson } from "./handler-http.js";

const InstantiateBody = z.object({ blueprint: z.string().trim().min(1), values: z.record(z.string(), z.string()).default({}) });

const list: ControlTable[string] = async (ctx) => {
  const all = await listAutomationBlueprints(ctx.state._env ?? process.env);
  const blueprints = all.filter((item) => item.kind === "schedule").map((item) => ({
    name: item.name, description: item.description,
    fields: item.fields.map((field) => ({ key: field.key, label: field.label, default: field.default ?? null })),
  }));
  sendJson(ctx.res, 200, { blueprints });
};

const instantiate: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, InstantiateBody);
  if (!body) return;
  const blueprint = await getAutomationBlueprint(body.blueprint, ctx.state._env ?? process.env);
  if (!blueprint || blueprint.kind !== "schedule") return sendFail(ctx.res, 404, `schedule blueprint not found: ${body.blueprint}`);
  try {
    // A schedule blueprint only creates a plain agent-instruction entry (no script), so no extra approval applies.
    const record = await applyAutomation(dataDirFor(ctx.state.root), blueprint, body.values, { confirmed: true });
    sendOk(ctx.res, { automation: record, scheduleId: Number(record.targetId) });
  } catch (error) { sendFail(ctx.res, 400, errorText(error)); }
};

export const scheduleBlueprintsGet: ControlTable = { "/api/schedules/blueprints": list };
export const scheduleBlueprintsPost: ControlTable = { "/api/schedules/blueprints/instantiate": instantiate };
