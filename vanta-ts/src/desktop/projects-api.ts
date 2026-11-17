import { z } from "zod";
import { createProject, deleteProject, listProjects, renameProject, setActiveProject } from "../projects/named.js";
import {
  type ControlCtx, type ControlTable, parseBody, sendFail, sendOk,
} from "./control-http.js";
import { sendJson } from "./handler-http.js";

const Id = z.string().trim().min(1).max(4096);
const CreateBody = z.object({ name: z.string(), path: z.string().trim().min(1).optional() });
const RenameBody = z.object({ id: Id, name: z.string() });
const IdBody = z.object({ id: Id });
const ActiveBody = z.object({ id: Id.nullable() });

const env = (ctx: ControlCtx): NodeJS.ProcessEnv => ctx.state._env ?? process.env;

const list: ControlTable[string] = async (ctx) => {
  sendJson(ctx.res, 200, await listProjects(ctx.state.root, env(ctx)));
};

const create: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, CreateBody);
  if (!body) return;
  const result = await createProject({ name: body.name, path: body.path ?? ctx.state.root }, env(ctx));
  if (!result.ok) return sendFail(ctx.res, result.status, result.error);
  sendOk(ctx.res, { project: result.value });
};

const rename: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, RenameBody);
  if (!body) return;
  const result = await renameProject(body.id, body.name, env(ctx));
  if (!result.ok) return sendFail(ctx.res, result.status, result.error);
  sendOk(ctx.res, { project: result.value });
};

const remove: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, IdBody);
  if (!body) return;
  const result = await deleteProject(body.id, env(ctx));
  if (!result.ok) return sendFail(ctx.res, result.status, result.error);
  sendOk(ctx.res, result.value);
};

const setActive: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, ActiveBody);
  if (!body) return;
  const result = await setActiveProject(body.id, ctx.state.root, env(ctx));
  if (!result.ok) return sendFail(ctx.res, result.status, result.error);
  sendOk(ctx.res, result.value);
};

export const projectsGet: ControlTable = { "/api/projects": list };
export const projectsPost: ControlTable = {
  "/api/projects/create": create, "/api/projects/rename": rename, "/api/projects/delete": remove, "/api/projects/set-active": setActive,
};
