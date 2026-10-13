import { isAbsolute } from "node:path";
import { z } from "zod";
import { inspectProfileDistribution, installProfileDistribution } from "../profiles/distribution.js";
import {
  archiveProfile, cloneProfile, clearActiveProfile, createProfile, listProfiles, renameProfile, switchProfile,
} from "../profiles/store.js";
import {
  type ControlCtx, type ControlTable, approveExactAction, errorText, parseBody, parseQuery, sendFail, sendOk,
} from "./control-http.js";
import { sendJson } from "./handler-http.js";
import {
  DEFAULT_PROFILE, MAX_SOUL_BYTES, exportProfileDistribution, listProfileViews, readSoul, resolveProfileHome, writeSoul,
} from "./profiles-view.js";

const Name = z.string().trim().min(1).max(64);
const CreateBody = z.object({ name: Name, cloneFrom: Name.optional(), model: z.string().trim().min(1).optional(), provider: z.string().trim().min(1).optional() });
const CloneBody = z.object({ source: Name, name: Name });
const NameBody = z.object({ name: Name });
const RenameBody = z.object({ name: Name, newName: Name });
const ImportBody = z.object({ source: z.string().trim().min(1).max(2048) });
const SoulBody = z.object({ name: Name, content: z.string() });
const SoulQuery = z.object({ name: Name });

const env = (ctx: ControlCtx): NodeJS.ProcessEnv => ctx.state._env ?? process.env;

/** Local directory (absolute) or an https Git URL. No ssh/file/ext transports and nothing option-shaped. */
export function importSourceError(source: string): string | null {
  if (source.startsWith("-")) return "profile source must not start with '-'";
  if (/^https:\/\/[^\s]+$/.test(source)) return null;
  if (isAbsolute(source)) return null;
  return "profile source must be an absolute directory path or an https:// Git URL";
}

const list: ControlTable[string] = async (ctx) => {
  sendJson(ctx.res, 200, { profiles: await listProfileViews(env(ctx)) });
};

const create: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, CreateBody);
  if (!body) return;
  if (body.name.toLowerCase() === DEFAULT_PROFILE) return sendFail(ctx.res, 409, `"${DEFAULT_PROFILE}" is the built-in profile and cannot be created`);
  try {
    const record = body.cloneFrom && body.cloneFrom.toLowerCase() !== DEFAULT_PROFILE
      ? await cloneProfile(body.cloneFrom, body.name, env(ctx))
      : await createProfile({ name: body.name, model: body.model, provider: body.provider }, env(ctx));
    sendOk(ctx.res, { name: record.name, id: record.id, path: record.home });
  } catch (error) { sendFail(ctx.res, 409, errorText(error)); }
};

const clone: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, CloneBody);
  if (!body) return;
  if (body.name.toLowerCase() === DEFAULT_PROFILE) return sendFail(ctx.res, 409, `"${DEFAULT_PROFILE}" is the built-in profile and cannot be created`);
  try {
    const record = await cloneProfile(body.source, body.name, env(ctx));
    sendOk(ctx.res, { name: record.name, id: record.id, path: record.home });
  } catch (error) { sendFail(ctx.res, 404, errorText(error)); }
};

const switchTo: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, NameBody);
  if (!body) return;
  try {
    if (body.name.toLowerCase() === DEFAULT_PROFILE) await clearActiveProfile(env(ctx));
    else await switchProfile(body.name, env(ctx));
    // The running server keeps its home; the sticky default is read at the next launch.
    sendOk(ctx.res, { name: body.name, appliesOnRestart: true });
  } catch (error) { sendFail(ctx.res, 404, errorText(error)); }
};

const rename: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, RenameBody);
  if (!body) return;
  if (body.name.toLowerCase() === DEFAULT_PROFILE) return sendFail(ctx.res, 409, "The default profile cannot be renamed.");
  try {
    const record = await renameProfile(body.name, body.newName, env(ctx));
    sendOk(ctx.res, { name: record.name, id: record.id, path: record.home });
  } catch (error) { sendFail(ctx.res, 409, errorText(error)); }
};

const remove: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, NameBody);
  if (!body) return;
  if (body.name.toLowerCase() === DEFAULT_PROFILE) return sendFail(ctx.res, 409, "The default profile cannot be deleted.");
  try {
    // Vanta retires a profile instead of erasing its home: memories and sessions stay recoverable on disk.
    const record = await archiveProfile(body.name, env(ctx));
    sendOk(ctx.res, { name: record.name, archived: true, path: record.home });
  } catch (error) { sendFail(ctx.res, 404, errorText(error)); }
};

const exportProfile: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, NameBody);
  if (!body) return;
  const record = (await listProfiles(env(ctx))).find((item) => item.status !== "archived" && (item.id === body.name.toLowerCase() || item.name.toLowerCase() === body.name.toLowerCase()));
  if (!record) return sendFail(ctx.res, 404, `profile not found: ${body.name}`);
  try { sendOk(ctx.res, { ...(await exportProfileDistribution(record, env(ctx))), name: record.name }); }
  catch (error) { sendFail(ctx.res, 422, errorText(error)); }
};

const importProfile: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, ImportBody);
  if (!body) return;
  const sourceError = importSourceError(body.source);
  if (sourceError) return sendFail(ctx.res, 400, sourceError);
  let preview;
  try { preview = await inspectProfileDistribution(body.source); } catch (error) { return sendFail(ctx.res, 422, errorText(error)); }
  const approved = await approveExactAction(ctx, {
    action: `import profile "${preview.name}" from ${body.source} at ${preview.sourceCommit.slice(0, 12)}: ${preview.files.join(", ") || "no files"}`,
    reason: "Importing a profile installs its soul, settings, skills, schedules and MCP config into a new profile.",
    toolName: "profile_import",
  });
  if (!approved) return;
  try {
    const result = await installProfileDistribution(body.source, env(ctx));
    if (result.sourceCommit !== preview.sourceCommit) {
      await archiveProfile(result.profile.id, env(ctx));
      return sendFail(ctx.res, 409, "The profile source changed after you approved it; nothing was kept. Try the import again.");
    }
    sendOk(ctx.res, { name: result.profile.name, id: result.profile.id, path: result.profile.home, files: result.files });
  } catch (error) { sendFail(ctx.res, 409, errorText(error)); }
};

const getSoul: ControlTable[string] = async (ctx) => {
  const query = parseQuery(ctx, SoulQuery);
  if (!query) return;
  const home = await resolveProfileHome(query.name, env(ctx));
  if (!home) return sendFail(ctx.res, 404, `profile not found: ${query.name}`);
  sendJson(ctx.res, 200, await readSoul(home));
};

const setSoul: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, SoulBody);
  if (!body) return;
  if (Buffer.byteLength(body.content, "utf8") > MAX_SOUL_BYTES) return sendFail(ctx.res, 413, `SOUL.md must be ${MAX_SOUL_BYTES / 1024} KB or smaller`);
  const home = await resolveProfileHome(body.name, env(ctx));
  if (!home) return sendFail(ctx.res, 404, `profile not found: ${body.name}`);
  await writeSoul(home, body.content);
  sendOk(ctx.res);
};

export const profilesGet: ControlTable = { "/api/profiles": list, "/api/profiles/soul": getSoul };
export const profilesPost: ControlTable = {
  "/api/profiles/create": create,
  "/api/profiles/clone": clone,
  "/api/profiles/import": importProfile,
  "/api/profiles/export": exportProfile,
  "/api/profiles/switch": switchTo,
  "/api/profiles/set-default": switchTo,
  "/api/profiles/rename": rename,
  "/api/profiles/delete": remove,
  "/api/profiles/soul": setSoul,
};
