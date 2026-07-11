import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { loadSettings, userSettingsPath } from "../settings/store.js";
import { commitInHome, ensureVantaStore, resolveVantaHome, skillsDir, slugifySkillName } from "../store/home.js";
import { scanForInjection } from "./gating.js";
import { archiveSkill, readSkill, writeSkill, type WriteInput } from "./store.js";

const WriteInputSchema = z.object({
  name: z.string().min(1).max(100), description: z.string().min(1).max(500), body: z.string().min(1).max(524_288),
  tags: z.array(z.string().max(100)).max(50).optional(), allowedTools: z.array(z.string().max(100)).max(100).optional(), license: z.string().max(100).optional(),
}).strict();
const MutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), input: WriteInputSchema }), z.object({ action: z.literal("edit"), input: WriteInputSchema }),
  z.object({ action: z.literal("patch"), slug: z.string().min(1), oldString: z.string().min(1), newString: z.string() }),
  z.object({ action: z.literal("delete"), slug: z.string().min(1) }),
  z.object({ action: z.literal("write_file"), slug: z.string().min(1), path: z.string().min(1), content: z.string().max(524_288) }),
  z.object({ action: z.literal("remove_file"), slug: z.string().min(1), path: z.string().min(1) }),
]);
export type SkillMutation = z.infer<typeof MutationSchema>;
export type PendingSkillMutation = {
  id: string; mutation: SkillMutation; status: "pending" | "approved" | "rejected"; createdAt: string; decidedAt?: string;
  sessionId?: string; reason: string; beforeHash: string; beforeContent: string; decisionNote?: string;
};
type SubmitOpts = { root: string; env?: NodeJS.ProcessEnv; sessionId?: string; reason: string; now?: Date };
type DecideOpts = { root?: string; env?: NodeJS.ProcessEnv; now?: Date };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const queueDir = (env: NodeJS.ProcessEnv) => join(resolveVantaHome(env), "pending", "skills");
const pendingPath = (id: string, env: NodeJS.ProcessEnv) => join(queueDir(env), `${id}.json`);

export async function setSkillWriteApproval(enabled: boolean, root: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const path = userSettingsPath(env), current = await readJson(path), skills = asObject(current.skills);
  current.skills = { ...skills, writeApproval: enabled }; await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
  await loadSettings(root, env);
}

export async function skillWriteApprovalEnabled(root: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return (await loadSettings(root, env)).skills?.writeApproval === true;
}

export async function submitAgentSkillMutation(mutationRaw: SkillMutation, opts: SubmitOpts): Promise<{ id: string; status: "staged" | "applied" }> {
  const env = opts.env ?? process.env, mutation = MutationSchema.parse(mutationRaw); validateMutationShape(mutation);
  const beforeContent = await currentContent(mutation, env), beforeHash = hash(beforeContent), now = opts.now ?? new Date();
  await assertMutationTarget(mutation, beforeContent, env);
  if (!await skillWriteApprovalEnabled(opts.root, env)) {
    await validateForApply(mutation); await applyMutation(mutation, `direct-${now.getTime()}`, env);
    return { id: `direct-${now.getTime()}`, status: "applied" };
  }
  const id = `${now.toISOString().replace(/\D/g, "").slice(0, 17)}-${hash(`${opts.sessionId ?? "agent"}:${JSON.stringify(mutation)}`).slice(0, 10)}`;
  const record: PendingSkillMutation = { id, mutation, status: "pending", createdAt: now.toISOString(), sessionId: opts.sessionId, reason: opts.reason, beforeHash, beforeContent };
  await mkdir(queueDir(env), { recursive: true }); await writeFile(pendingPath(id, env), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  return { id, status: "staged" };
}

async function assertMutationTarget(mutation: SkillMutation, before: string, env: NodeJS.ProcessEnv): Promise<void> {
  if (mutation.action === "create" && before) throw new Error("skill already exists; use edit or patch");
  if (["edit", "patch", "delete", "remove_file"].includes(mutation.action) && !before) throw new Error(`skill mutation ${mutation.action} target not found`);
  if (mutation.action === "write_file" && !await readSkill(mutation.slug, env)) throw new Error(`skill ${mutation.slug} not found`);
}

export async function listPendingSkillMutations(env: NodeJS.ProcessEnv = process.env): Promise<PendingSkillMutation[]> {
  try {
    const entries = (await readdir(queueDir(env))).filter((name) => name.endsWith(".json"));
    const records = await Promise.all(entries.map((name) => readRecord(join(queueDir(env), name))));
    return records.filter((item): item is PendingSkillMutation => item?.status === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch { return []; }
}

export async function approveSkillMutation(id: string, opts: DecideOpts): Promise<PendingSkillMutation> {
  const env = opts.env ?? process.env, record = await requiredPending(id, env), current = await currentContent(record.mutation, env);
  if (hash(current) !== record.beforeHash) throw new Error("active skill changed since proposal; reject or recreate the mutation");
  await validateForApply(record.mutation); await applyMutation(record.mutation, id, env);
  return resolveRecord(record, { status: "approved", note: "approved", env, now: opts.now ?? new Date() });
}

export async function rejectSkillMutation(id: string, note: string, opts: DecideOpts): Promise<PendingSkillMutation> {
  const env = opts.env ?? process.env, record = await requiredPending(id, env);
  return resolveRecord(record, { status: "rejected", note: note || "rejected", env, now: opts.now ?? new Date() });
}

export function formatSkillMutationDiff(record: PendingSkillMutation, maxChars = Number.POSITIVE_INFINITY, env: NodeJS.ProcessEnv = process.env): string {
  const after = proposedContent(record.mutation, record.beforeContent), body = lineDiff(record.beforeContent, after);
  if (body.length <= maxChars) return body;
  return `${body.slice(0, Math.max(0, maxChars - 80))}\n... truncated; full proposal: ${pendingPath(record.id, env)}`;
}

async function applyMutation(mutation: SkillMutation, id: string, env: NodeJS.ProcessEnv): Promise<void> {
  if (mutation.action === "create" || mutation.action === "edit") { await writeSkill(mutation.input, { env }); return; }
  if (mutation.action === "patch") { await applyPatch(mutation, env); return; }
  if (mutation.action === "delete") { if (!await archiveSkill(mutation.slug, env)) throw new Error(`skill ${mutation.slug} could not be archived`); return; }
  const slug = slugifySkillName(mutation.slug), path = safeRelative(mutation.path), target = join(skillsDir(env), slug, path); await ensureVantaStore(env);
  if (mutation.action === "write_file") { await mkdir(dirname(target), { recursive: true }); await writeFile(target, mutation.content, { mode: 0o600 }); await commitInHome(join("skills", slug, path), `skill file: ${slug}/${path}`, env); return; }
  const removed = join(resolveVantaHome(env), "skill-write-removed", id, slug, path); await mkdir(dirname(removed), { recursive: true }); await rename(target, removed); await commitInHome(join("skills", slug), `skill file remove: ${slug}/${path}`, env);
}

async function applyPatch(mutation: Extract<SkillMutation, { action: "patch" }>, env: NodeJS.ProcessEnv): Promise<void> {
  const skill = await readSkill(mutation.slug, env); if (!skill) throw new Error(`skill ${mutation.slug} not found`);
  if (skill.body.split(mutation.oldString).length !== 2) throw new Error("patch oldString must match exactly once");
  await writeSkill(inputFromSkill(skill, skill.body.replace(mutation.oldString, mutation.newString)), { env });
}

async function validateForApply(mutation: SkillMutation): Promise<void> {
  validateMutationShape(mutation); const content = mutationContent(mutation), hits = scanForInjection(content).hits;
  if (hits.length) throw new Error(`injection scan blocked mutation: ${hits.join(", ")}`);
  const input = "input" in mutation ? mutation.input : undefined;
  if (input?.allowedTools?.some((tool) => !/^[A-Za-z0-9_.:-]+$/.test(tool))) throw new Error("requested capability name is invalid");
}

function validateMutationShape(mutation: SkillMutation): void {
  if ("path" in mutation) safeRelative(mutation.path);
  if ((mutation.action === "create" || mutation.action === "edit") && !slugifySkillName(mutation.input.name)) throw new Error("skill name is invalid");
}

async function currentContent(mutation: SkillMutation, env: NodeJS.ProcessEnv): Promise<string> {
  if (mutation.action === "create" || mutation.action === "edit") return readFile(join(skillsDir(env), slugifySkillName(mutation.input.name), "SKILL.md"), "utf8").catch(() => "");
  if (mutation.action === "write_file" || mutation.action === "remove_file") return readFile(join(skillsDir(env), slugifySkillName(mutation.slug), safeRelative(mutation.path)), "utf8").catch(() => "");
  return readFile(join(skillsDir(env), slugifySkillName(mutation.slug), "SKILL.md"), "utf8").catch(() => "");
}

function proposedContent(mutation: SkillMutation, before: string): string {
  if (mutation.action === "create" || mutation.action === "edit") return mutation.input.body;
  if (mutation.action === "patch") return before.replace(mutation.oldString, mutation.newString);
  if (mutation.action === "write_file") return mutation.content;
  return "";
}

function mutationContent(mutation: SkillMutation): string {
  if (mutation.action === "create" || mutation.action === "edit") return mutation.input.body;
  if (mutation.action === "patch") return mutation.newString;
  return mutation.action === "write_file" ? mutation.content : "";
}

async function resolveRecord(record: PendingSkillMutation, opts: { status: "approved" | "rejected"; note: string; env: NodeJS.ProcessEnv; now: Date }): Promise<PendingSkillMutation> {
  const { status, note, env, now } = opts;
  const updated = { ...record, status, decidedAt: now.toISOString(), decisionNote: note }, resolved = join(queueDir(env), "_resolved", `${record.id}.json`);
  await mkdir(dirname(resolved), { recursive: true }); await writeFile(resolved, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 }); await rm(pendingPath(record.id, env));
  await appendFile(join(resolveVantaHome(env), "skill-write-audit.jsonl"), `${JSON.stringify({ id: record.id, action: record.mutation.action, slug: mutationSlug(record.mutation), sessionId: record.sessionId, reason: record.reason, decision: status, note, at: now.toISOString(), resultingHash: status === "approved" ? hash(await currentContent(record.mutation, env)) : record.beforeHash })}\n`, "utf8");
  return updated;
}

async function requiredPending(id: string, env: NodeJS.ProcessEnv): Promise<PendingSkillMutation> { const record = await readRecord(pendingPath(id, env)); if (!record || record.status !== "pending") throw new Error(`pending skill mutation ${id} not found`); return record; }
async function readRecord(path: string): Promise<PendingSkillMutation | null> { try { return JSON.parse(await readFile(path, "utf8")) as PendingSkillMutation; } catch { return null; } }
async function readJson(path: string): Promise<Record<string, unknown>> { try { return asObject(JSON.parse(await readFile(path, "utf8"))); } catch { return {}; } }
const asObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const mutationSlug = (mutation: SkillMutation) => mutation.action === "create" || mutation.action === "edit" ? slugifySkillName(mutation.input.name) : slugifySkillName(mutation.slug);
function safeRelative(path: string): string { if (!path || path === "SKILL.md" || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "..")) throw new Error("supporting-file path must be contained and cannot be SKILL.md"); return path; }
function inputFromSkill(skill: NonNullable<Awaited<ReturnType<typeof readSkill>>>, body: string): WriteInput { return { name: skill.meta.name, description: skill.meta.description, body, tags: skill.meta.tags, allowedTools: skill.meta.allowedTools, license: skill.meta.license }; }
function lineDiff(before: string, after: string): string { const old = new Set(before.split("\n")), next = new Set(after.split("\n")); return [...before.split("\n").filter((line) => !next.has(line)).map((line) => `-${line}`), ...after.split("\n").filter((line) => !old.has(line)).map((line) => `+${line}`)].join("\n") || "(no changes)"; }
