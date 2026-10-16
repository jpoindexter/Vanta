import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { archiveSkill, listSkills, readSkill, writeSkill } from "../skills/store.js";
import { memoriesDir } from "../store/home.js";
import { type ControlCtx, type ControlTable, approveExactAction, errorText, parseBody, sendFail, sendOk } from "./control-http.js";

// Editing and archiving a Memory Graph node. Every change asks first through the same exact-action card as other skill
// changes. Archiving moves the file into an `_archive` folder; nothing is ever deleted.

const MEMORY_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.md$/;
const MAX_CONTENT_BYTES = 200_000;
const ARCHIVE_DIR = "_archive";

const NodeId = z.string().trim().min(1).max(200);
const ArchiveBody = z.object({ id: NodeId });
const EditBody = z.object({ id: NodeId, content: z.string().max(MAX_CONTENT_BYTES) });

const env = (ctx: ControlCtx): NodeJS.ProcessEnv => ctx.state._env ?? process.env;

type Target = { kind: "skill"; name: string } | { kind: "memory"; file: string };

function parseTarget(id: string): Target | string {
  if (id.startsWith("memory:")) {
    const file = id.slice(7);
    return MEMORY_FILE.test(file) ? { kind: "memory", file } : "memory ids look like memory:<file>.md";
  }
  // The Skills tab editor sends a bare skill name; the graph sends skill:<name>.
  const name = id.startsWith("skill:") ? id.slice(6) : id;
  return name.trim() ? { kind: "skill", name: name.trim() } : "id must be skill:<name> or memory:<file>.md";
}

async function archiveMemory(file: string, e: NodeJS.ProcessEnv): Promise<void> {
  const dir = memoriesDir(e);
  await mkdir(join(dir, ARCHIVE_DIR), { recursive: true });
  await rename(join(dir, file), join(dir, ARCHIVE_DIR, file));
}

const archive: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, ArchiveBody);
  if (!body) return;
  const target = parseTarget(body.id);
  if (typeof target === "string") return sendFail(ctx.res, 400, target);
  const e = env(ctx);
  const label = target.kind === "skill" ? target.name : target.file;
  if (target.kind === "skill" && !(await listSkills(e)).some((skill) => skill.meta.name === target.name)) return sendFail(ctx.res, 404, `skill not found: ${label}`);
  const approved = await approveExactAction(ctx, {
    action: `archive ${target.kind} ${label} (moved to ${ARCHIVE_DIR}, restorable)`,
    reason: "The agent will stop using it. Nothing is deleted; the file moves to an archive folder.",
    toolName: "memory_archive",
  });
  if (!approved) return;
  try {
    if (target.kind === "skill") {
      if (!(await archiveSkill(target.name, e))) return sendFail(ctx.res, 409, `could not archive ${label}`);
    } else await archiveMemory(target.file, e);
    sendOk(ctx.res, { message: `Archived ${label}.` });
  } catch (error) { sendFail(ctx.res, 409, errorText(error)); }
};

const edit: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, EditBody);
  if (!body) return;
  const target = parseTarget(body.id);
  if (typeof target === "string") return sendFail(ctx.res, 400, target);
  const e = env(ctx);
  const label = target.kind === "skill" ? target.name : target.file;
  const skill = target.kind === "skill" ? await readSkill(target.name, e) : null;
  if (target.kind === "skill" && !skill) return sendFail(ctx.res, 404, `skill not found: ${label}`);
  const approved = await approveExactAction(ctx, {
    action: `change ${target.kind} ${label} (${body.content.split("\n").length} lines)`,
    reason: "The agent follows this text. Your edit replaces the current version.",
    toolName: "memory_edit",
  });
  if (!approved) return;
  try {
    if (target.kind === "skill" && skill) await writeSkill({ name: skill.meta.name, description: skill.meta.description, body: body.content, tags: skill.meta.tags }, { env: e });
    else if (target.kind === "memory") {
      const path = join(memoriesDir(e), target.file);
      if ((await readFile(path, "utf8").catch(() => null)) === null) return sendFail(ctx.res, 404, `memory not found: ${label}`);
      await writeFile(path, body.content, "utf8");
    }
    sendOk(ctx.res, { message: `Saved ${label}.` });
  } catch (error) { sendFail(ctx.res, 409, errorText(error)); }
};

export const learningWritePost: ControlTable = { "/api/learning/node-archive": archive, "/api/learning/node-edit": edit };
