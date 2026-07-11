import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { commitInHome, resolveVantaHome, skillsDir } from "../store/home.js";
import { RegistryIndexSchema, RegistryInstallSchema, type RegistryInstall, type RegistrySkill } from "./registry-schema.js";

type Env = NodeJS.ProcessEnv;
type ViewedSkill = RegistrySkill & { content: string; integrityOk: boolean };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const homePath = (env: Env, ...parts: string[]) => join(resolveVantaHome(env), ...parts);
const metadataPath = (env: Env) => homePath(env, "skill-registry-installs.json");

async function loadIndex(env: Env): Promise<{ location: string; skills: RegistrySkill[] }> {
  const location = env.VANTA_SKILL_REGISTRY?.trim();
  if (!location) throw new Error("VANTA_SKILL_REGISTRY is not configured");
  const text = /^https?:\/\//.test(location) ? await fetch(location).then(assertResponse) : await readFile(location, "utf8");
  return { location, skills: RegistryIndexSchema.parse(JSON.parse(text)).skills };
}

async function assertResponse(response: Response): Promise<string> {
  if (!response.ok) throw new Error(`registry HTTP ${response.status}`);
  return response.text();
}

export async function browseRegistry(env: Env = process.env): Promise<RegistrySkill[]> {
  return (await loadIndex(env)).skills.sort((a, b) => a.name.localeCompare(b.name));
}

export async function searchRegistry(query: string, env: Env = process.env): Promise<RegistrySkill[]> {
  const needle = query.trim().toLowerCase();
  return (await browseRegistry(env)).filter((item) => `${item.slug} ${item.name} ${item.description} ${item.capabilities.join(" ")}`.toLowerCase().includes(needle));
}

export async function viewRegistrySkill(slug: string, env: Env = process.env): Promise<ViewedSkill | null> {
  const registry = await loadIndex(env), item = registry.skills.find((skill) => skill.slug === slug);
  if (!item) return null;
  const source = resolveSource(registry.location, item.source);
  const content = /^https?:\/\//.test(source) ? await fetch(source).then(assertResponse) : await readFile(source, "utf8");
  return { ...item, source, content, integrityOk: hash(content) === item.sha256 };
}

function resolveSource(index: string, source: string): string {
  if (/^https?:\/\//.test(index)) return new URL(source, index).toString();
  const base = dirname(resolve(index)), absolute = resolve(base, source);
  if (relative(base, absolute).startsWith("..")) throw new Error("registry skill source escapes registry directory");
  return absolute;
}

async function readInstalls(env: Env): Promise<RegistryInstall[]> {
  try {
    const raw = JSON.parse(await readFile(metadataPath(env), "utf8")) as { installs?: unknown[] };
    return (raw.installs ?? []).flatMap((item) => { const parsed = RegistryInstallSchema.safeParse(item); return parsed.success ? [parsed.data] : []; });
  } catch { return []; }
}

async function saveInstalls(env: Env, installs: RegistryInstall[]): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  await writeFile(metadataPath(env), `${JSON.stringify({ version: 1, installs }, null, 2)}\n`, "utf8");
}

export async function installRegistrySkill(slug: string, opts: { env?: Env; confirmed: boolean; now?: Date }): Promise<RegistryInstall> {
  if (!opts.confirmed) throw new Error("installation requires confirmation after preview");
  const env = opts.env ?? process.env, viewed = await requiredView(slug, env), installs = await readInstalls(env);
  if (installs.some((item) => item.slug === slug && item.status !== "removed")) throw new Error(`registry skill ${slug} is already installed`);
  const target = homePath(env, "skill-registry-quarantine", slug, "SKILL.md");
  await writePrivate(target, viewed.content);
  const record: RegistryInstall = {
    slug, version: viewed.version, source: viewed.source, sha256: viewed.sha256, installedSha256: viewed.sha256,
    status: "disabled", updatedAt: (opts.now ?? new Date()).toISOString(),
  };
  await saveInstalls(env, [...installs.filter((item) => item.slug !== slug), record]);
  await audit(env, "install-disabled", record);
  return record;
}

export async function approveRegistrySkill(slug: string, env: Env = process.env): Promise<RegistryInstall> {
  const installs = await readInstalls(env), index = installs.findIndex((item) => item.slug === slug && item.status === "disabled");
  if (index < 0) throw new Error(`disabled registry skill ${slug} not found`);
  const target = join(skillsDir(env), slug, "SKILL.md");
  try { await readFile(target); throw new Error(`active skill ${slug} already exists; refusing overwrite`); } catch (error) { if ((error as Error).message.includes("refusing")) throw error; }
  await mkdir(dirname(target), { recursive: true });
  await rename(homePath(env, "skill-registry-quarantine", slug), join(skillsDir(env), slug));
  const updated = { ...installs[index]!, status: "active" as const, updatedAt: new Date().toISOString() };
  installs[index] = updated; await saveInstalls(env, installs);
  await commitInHome(join("skills", slug, "SKILL.md"), `skill registry: approve ${slug}`, env);
  await audit(env, "approve", updated);
  return updated;
}

export async function updateRegistrySkill(slug: string, opts: { env?: Env; confirmed: boolean }): Promise<{ status: string; diff: string }> {
  const env = opts.env ?? process.env, installs = await readInstalls(env), index = installs.findIndex((item) => item.slug === slug && item.status !== "removed");
  if (index < 0) throw new Error(`registry skill ${slug} is not installed`);
  const current = installs[index]!, viewed = await requiredView(slug, env);
  const activePath = current.status === "active" ? join(skillsDir(env), slug, "SKILL.md") : homePath(env, "skill-registry-quarantine", slug, "SKILL.md");
  const existing = await readFile(activePath, "utf8"), diff = lineDiff(existing, viewed.content);
  if (!opts.confirmed) return { status: "preview", diff };
  if (hash(existing) !== current.installedSha256) {
    await writePrivate(homePath(env, "skill-registry-updates", slug, viewed.version, "SKILL.md"), viewed.content);
    await audit(env, "update-conflict", current);
    return { status: "local-edits-preserved", diff };
  }
  await writePrivate(homePath(env, "skill-registry-backups", slug, current.version, "SKILL.md"), existing);
  await writePrivate(activePath, viewed.content);
  installs[index] = { ...current, version: viewed.version, source: viewed.source, sha256: viewed.sha256, installedSha256: viewed.sha256, updatedAt: new Date().toISOString() };
  await saveInstalls(env, installs); await audit(env, "update", installs[index]!);
  return { status: "updated", diff };
}

export async function removeRegistrySkill(slug: string, env: Env = process.env): Promise<void> {
  const installs = await readInstalls(env), index = installs.findIndex((item) => item.slug === slug && item.status !== "removed");
  if (index < 0) throw new Error(`registry skill ${slug} is not installed`);
  const record = installs[index]!, source = record.status === "active" ? join(skillsDir(env), slug) : homePath(env, "skill-registry-quarantine", slug);
  const target = homePath(env, "skill-registry-removed", slug);
  await rm(target, { recursive: true, force: true }); await mkdir(dirname(target), { recursive: true }); await rename(source, target);
  installs[index] = { ...record, status: "removed", updatedAt: new Date().toISOString() };
  await saveInstalls(env, installs); await audit(env, "remove", installs[index]!);
}

export async function doctorRegistrySkills(env: Env = process.env): Promise<Array<{ slug: string; status: string }>> {
  const results: Array<{ slug: string; status: string }> = [];
  for (const item of await readInstalls(env)) {
    if (item.status === "removed") { results.push({ slug: item.slug, status: "removed" }); continue; }
    const path = item.status === "active" ? join(skillsDir(env), item.slug, "SKILL.md") : homePath(env, "skill-registry-quarantine", item.slug, "SKILL.md");
    const actual = await readFile(path, "utf8").then(hash).catch(() => "missing");
    results.push({ slug: item.slug, status: actual === item.installedSha256 ? "ok" : actual === "missing" ? "missing" : "modified" });
  }
  return results;
}

async function requiredView(slug: string, env: Env): Promise<ViewedSkill> {
  const viewed = await viewRegistrySkill(slug, env);
  if (!viewed) throw new Error(`registry skill ${slug} not found`);
  if (!viewed.integrityOk) throw new Error(`integrity mismatch for ${slug}`);
  return viewed;
}

async function writePrivate(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, content, { encoding: "utf8", mode: 0o600 });
}

function lineDiff(before: string, after: string): string {
  if (before === after) return "(no changes)";
  const old = new Set(before.split("\n")), next = new Set(after.split("\n"));
  return [...before.split("\n").filter((line) => !next.has(line)).map((line) => `-${line}`), ...after.split("\n").filter((line) => !old.has(line)).map((line) => `+${line}`)].join("\n");
}

async function audit(env: Env, action: string, record: RegistryInstall): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  await appendFile(homePath(env, "skill-registry-audit.jsonl"), `${JSON.stringify({ action, slug: record.slug, version: record.version, source: record.source, sha256: record.sha256, status: record.status, at: new Date().toISOString() })}\n`, "utf8");
}
