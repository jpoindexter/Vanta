import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { createProfile, listProfiles, profileHome, updateProfileDefinition, type ProfileRecord } from "./store.js";

const exec = promisify(execFile);
const ManifestSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  description: z.string().optional(),
  profile: z.object({
    provider: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    gatewayIdentity: z.string().min(1).optional(),
  }).optional(),
  soul: z.string().min(1).optional(),
  settings: z.string().min(1).optional(),
  skills: z.array(z.string().min(1)).default([]),
  cron: z.string().min(1).optional(),
  mcp: z.string().min(1).optional(),
});

type Manifest = z.infer<typeof ManifestSchema>;
type OwnedFile = { source: string; destination: string; sha256: string };
type InstalledRecord = {
  version: 1;
  source: string;
  sourceCommit: string;
  installedAt: string;
  files: OwnedFile[];
};

export type DistributionPreview = {
  profileId: string;
  name: string;
  source: string;
  sourceCommit: string;
  files: string[];
};

export type DistributionInstallResult = DistributionPreview & { profile: ProfileRecord };
export type DistributionUpdateResult = DistributionPreview & {
  changed: string[];
  applied: boolean;
  backupDir?: string;
};

type Materialized = { root: string; source: string; cleanup: () => Promise<void> };
type Inspected = DistributionPreview & { manifest: Manifest; owned: OwnedFile[]; root: string };

function profileSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9 _-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function materialize(source: string): Promise<Materialized> {
  const local = resolve(source);
  try {
    if ((await stat(local)).isDirectory()) return { root: local, source: local, cleanup: async () => {} };
  } catch { /* try Git below */ }
  const dir = await mkdtemp(join(tmpdir(), "vanta-profile-source-"));
  const root = join(dir, "repo");
  try {
    await exec("git", ["clone", "--depth", "1", source, root]);
    return { root, source, cleanup: () => rm(dir, { recursive: true, force: true }) };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw new Error(`cannot load profile distribution: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function sourceCommit(root: string): Promise<string> {
  try { return (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim(); }
  catch { return `local-${createHash("sha256").update(await readFile(join(root, "vanta-profile.json"))).digest("hex")}`; }
}

async function walk(root: string, dir = root): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(root, full));
    else if (entry.isFile()) out.push(relative(root, full));
  }
  return out.sort();
}

function forbidden(rel: string): boolean {
  return rel.split(/[\\/]/).some((segment) => {
    const lower = segment.toLowerCase();
    return lower === ".env" || lower.startsWith(".env.")
      || ["memory", "memories", "session", "sessions", "inbox.jsonl", "work.jsonl", "history"].includes(lower)
      || /(^|[-_.])(secret|token|credential|api[-_]?key)([-_.]|$)/.test(lower)
      || lower.endsWith(".key");
  });
}

function safeSourcePath(root: string, rel: string): string {
  if (isAbsolute(rel)) throw new Error(`distribution path must be relative: ${rel}`);
  const full = resolve(root, rel);
  if (full !== root && !full.startsWith(root + sep)) throw new Error(`distribution path escapes source: ${rel}`);
  return full;
}

async function assertRealSource(root: string, rel: string, path: string): Promise<void> {
  const [realRoot, realFile] = await Promise.all([realpath(root), realpath(path)]);
  if (realFile !== realRoot && !realFile.startsWith(realRoot + sep)) {
    throw new Error(`distribution path escapes source through symlink: ${rel}`);
  }
}

function safeTargetPath(root: string, rel: string): string {
  if (isAbsolute(rel)) throw new Error(`installed distribution path escapes profile: ${rel}`);
  const full = resolve(root, rel);
  if (full !== root && !full.startsWith(root + sep)) throw new Error(`installed distribution path escapes profile: ${rel}`);
  return full;
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function mapFile(root: string, source: string, destination: string): Promise<OwnedFile> {
  const path = safeSourcePath(root, source);
  await assertRealSource(root, source, path);
  if (!(await stat(path)).isFile()) throw new Error(`distribution file missing: ${source}`);
  return { source, destination, sha256: await sha256(path) };
}

async function mapSkill(root: string, skill: string): Promise<OwnedFile[]> {
  const path = safeSourcePath(root, skill);
  await assertRealSource(root, skill, path);
  const info = await stat(path);
  if (info.isFile()) return [await mapFile(root, skill, join("skills", basename(skill)))];
  if (!info.isDirectory()) throw new Error(`distribution skill missing: ${skill}`);
  const files = await walk(root, path);
  return Promise.all(files.map((file) => mapFile(root, file, join("skills", basename(skill), relative(path, join(root, file))))));
}

function secretField(value: unknown, path: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = secretField(value[index], [...path, String(index)]);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  for (const [key, child] of Object.entries(value)) {
    const next = [...path, key];
    if (/(^|[-_.])(secret|token|credential|api[-_]?key|private[-_]?key|password)([-_.]|$)/i.test(key)) return next.join(".");
    const found = secretField(child, next);
    if (found) return found;
  }
  return null;
}

async function rejectJsonSecrets(root: string, manifest: Manifest): Promise<void> {
  for (const rel of [manifest.settings, manifest.cron, manifest.mcp].filter((item): item is string => Boolean(item))) {
    let parsed: unknown;
    try { parsed = JSON.parse(await readFile(safeSourcePath(root, rel), "utf8")); }
    catch { throw new Error(`distribution JSON is invalid: ${rel}`); }
    const field = secretField(parsed);
    if (field) throw new Error(`profile distribution refuses secret field: ${rel}:${field}`);
  }
}

async function inspectMaterialized(item: Materialized): Promise<Inspected> {
  const all = await walk(item.root);
  const denied = all.find(forbidden);
  if (denied) throw new Error(`profile distribution refuses secret/history file: ${denied}`);
  const parsed = ManifestSchema.safeParse(JSON.parse(await readFile(join(item.root, "vanta-profile.json"), "utf8")));
  if (!parsed.success) throw new Error(`invalid vanta-profile.json: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  const manifest = parsed.data;
  await rejectJsonSecrets(item.root, manifest);
  const owned: OwnedFile[] = [];
  if (manifest.soul) owned.push(await mapFile(item.root, manifest.soul, "SOUL.md"));
  if (manifest.settings) owned.push(await mapFile(item.root, manifest.settings, "settings.json"));
  if (manifest.cron) owned.push(await mapFile(item.root, manifest.cron, "scheduled_tasks.json"));
  if (manifest.mcp) owned.push(await mapFile(item.root, manifest.mcp, "mcp.json"));
  for (const skill of manifest.skills) owned.push(...await mapSkill(item.root, skill));
  owned.sort((a, b) => a.destination < b.destination ? -1 : a.destination > b.destination ? 1 : 0);
  return {
    profileId: profileSlug(manifest.name), name: manifest.name, source: item.source,
    sourceCommit: await sourceCommit(item.root), files: owned.map((file) => file.destination),
    manifest, owned, root: item.root,
  };
}

export async function inspectProfileDistribution(source: string): Promise<DistributionPreview> {
  const item = await materialize(source);
  try { const { manifest: _manifest, owned: _owned, root: _root, ...preview } = await inspectMaterialized(item); return preview; }
  finally { await item.cleanup(); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeObjects(base: unknown, over: unknown): Record<string, unknown> {
  const left = isRecord(base) ? base : {};
  const right = isRecord(over) ? over : {};
  const result: Record<string, unknown> = { ...left };
  for (const [key, value] of Object.entries(right)) {
    result[key] = isRecord(value) ? mergeObjects(result[key], value) : value;
  }
  return result;
}

async function copyOwned(inspected: Inspected, target: string, preserveSettings: boolean): Promise<void> {
  for (const file of inspected.owned) {
    const destination = safeTargetPath(target, file.destination);
    await mkdir(dirname(destination), { recursive: true });
    if (file.destination === "settings.json") {
      const incoming = JSON.parse(await readFile(join(inspected.root, file.source), "utf8"));
      let current: unknown = {};
      try { current = JSON.parse(await readFile(destination, "utf8")); } catch { /* no current settings */ }
      const merged = preserveSettings ? mergeObjects(incoming, current) : mergeObjects(current, incoming);
      await writeFile(destination, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
    } else {
      await cp(join(inspected.root, file.source), destination);
    }
  }
}

function installRecord(inspected: Inspected, installedAt: string): InstalledRecord {
  return { version: 1, source: inspected.source, sourceCommit: inspected.sourceCommit, installedAt, files: inspected.owned };
}

export async function installProfileDistribution(source: string, env: NodeJS.ProcessEnv = process.env, now = () => new Date()): Promise<DistributionInstallResult> {
  const item = await materialize(source);
  try {
    const inspected = await inspectMaterialized(item);
    const profile = await createProfile({ name: inspected.name, ...inspected.manifest.profile }, env, now);
    await copyOwned(inspected, profile.home, false);
    await writeFile(join(profile.home, "distribution.json"), `${JSON.stringify(installRecord(inspected, now().toISOString()), null, 2)}\n`);
    const { manifest: _manifest, owned: _owned, root: _root, ...preview } = inspected;
    return { ...preview, profile };
  } finally { await item.cleanup(); }
}

async function readInstalled(profile: ProfileRecord): Promise<InstalledRecord> {
  const parsed = z.object({ version: z.literal(1), source: z.string(), sourceCommit: z.string(), installedAt: z.string(), files: z.array(z.object({ source: z.string(), destination: z.string(), sha256: z.string() })) })
    .safeParse(JSON.parse(await readFile(join(profile.home, "distribution.json"), "utf8")));
  if (!parsed.success) throw new Error(`profile has no valid distribution record: ${profile.id}`);
  return parsed.data;
}

function changedFiles(before: OwnedFile[], after: OwnedFile[]): string[] {
  const old = new Map(before.map((file) => [file.destination, file.sha256]));
  const next = new Map(after.map((file) => [file.destination, file.sha256]));
  return [...new Set([...old.keys(), ...next.keys()])].filter((path) => old.get(path) !== next.get(path)).sort();
}

async function backupOwned(target: string, files: OwnedFile[], now: Date): Promise<string> {
  const backup = join(target, "backups", `distribution-${now.toISOString().replace(/[:.]/g, "-")}`);
  for (const file of files) {
    const source = safeTargetPath(target, file.destination);
    try { await mkdir(dirname(join(backup, file.destination)), { recursive: true }); await cp(source, join(backup, file.destination)); }
    catch { /* missing previous file needs no backup */ }
  }
  return backup;
}

async function removeStaleOwned(target: string, before: OwnedFile[], after: OwnedFile[]): Promise<void> {
  const current = new Set(after.map((file) => file.destination));
  for (const file of before) {
    if (!current.has(file.destination)) await rm(safeTargetPath(target, file.destination), { recursive: true, force: true });
  }
}

export async function updateProfileDistribution(
  profileId: string,
  env: NodeJS.ProcessEnv = process.env,
  opts: { apply: boolean; now?: () => Date } = { apply: false },
): Promise<DistributionUpdateResult> {
  const profile = (await listProfiles(env)).find((item) => item.id === profileId);
  if (!profile || profile.status === "archived") throw new Error(`profile not found: ${profileId}`);
  const installed = await readInstalled(profile);
  const item = await materialize(installed.source);
  try {
    const inspected = await inspectMaterialized(item);
    const changed = changedFiles(installed.files, inspected.owned);
    const base = { profileId: inspected.profileId, name: inspected.name, source: inspected.source, sourceCommit: inspected.sourceCommit, files: inspected.files, changed };
    if (!opts.apply) return { ...base, applied: false };
    const clock = opts.now ?? (() => new Date());
    const stamp = clock();
    const backupDir = await backupOwned(profile.home, installed.files, stamp);
    await removeStaleOwned(profile.home, installed.files, inspected.owned);
    await copyOwned(inspected, profile.home, true);
    await updateProfileDefinition(profile.id, inspected.manifest.profile ?? {}, env, () => stamp);
    await writeFile(join(profile.home, "distribution.json"), `${JSON.stringify(installRecord(inspected, stamp.toISOString()), null, 2)}\n`);
    return { ...base, applied: true, backupDir };
  } finally { await item.cleanup(); }
}
