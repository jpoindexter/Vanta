import { createHash } from "node:crypto";
import { appendFile, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { commitInHome, resolveVantaHome, skillsDir } from "../store/home.js";
import { RegistryIndexSchema, RegistryInstallSchema, type RegistryInstall, type RegistrySkill } from "./registry-schema.js";
import { scanForInjection } from "./gating.js";

type Env = NodeJS.ProcessEnv;
type ViewedFile = { path: string; source: string; bytes: Buffer; sha256: string; executable: boolean };
type ViewedSkill = RegistrySkill & { content: string; integrityOk: boolean; packageFiles: ViewedFile[]; risks: string[] };
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const homePath = (env: Env, ...parts: string[]) => join(resolveVantaHome(env), ...parts);
const metadataPath = (env: Env) => homePath(env, "skill-registry-installs.json");
const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;

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
  validateManifest(item);
  const source = resolveSource(registry.location, item.source), mainBytes = await readResource(source);
  const companions = await Promise.all(item.files.map(async (file) => ({
    path: file.path, source: resolveSource(registry.location, file.source), sha256: file.sha256,
    executable: file.executable, bytes: await readResource(resolveSource(registry.location, file.source)),
  })));
  const packageFiles = [{ path: "SKILL.md", source, bytes: mainBytes, sha256: item.sha256, executable: false }, ...companions];
  const total = packageFiles.reduce((sum, file) => sum + file.bytes.byteLength, 0);
  if (total > MAX_PACKAGE_BYTES) throw new Error("registry skill package exceeds 2 MiB");
  const integrityOk = packageFiles.every((file, index) => hash(file.bytes) === file.sha256
    && (index === 0 || file.bytes.byteLength === item.files[index - 1]?.bytes));
  const content = mainBytes.toString("utf8");
  return { ...item, source, content, integrityOk, packageFiles, risks: packageRisks(content, packageFiles) };
}

function validateManifest(item: RegistrySkill): void {
  const paths = item.files.map((file) => file.path);
  if (paths.includes("SKILL.md") || new Set(paths).size !== paths.length) throw new Error("registry package paths must be unique and exclude SKILL.md");
  if (item.files.reduce((sum, file) => sum + file.bytes, 0) > MAX_PACKAGE_BYTES) throw new Error("registry skill package exceeds 2 MiB");
}

async function readResource(source: string): Promise<Buffer> {
  if (!/^https?:\/\//.test(source)) return readFile(source);
  const response = await fetch(source);
  if (!response.ok) throw new Error(`registry HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function resolveSource(index: string, source: string): string {
  if (/^https?:\/\//.test(index)) return new URL(source, index).toString();
  const base = dirname(resolve(index)), absolute = resolve(base, source), rel = relative(base, absolute);
  if (rel.startsWith("..") || rel.startsWith("/")) throw new Error("registry skill source escapes registry directory");
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
  await writePackage(homePath(env, "skill-registry-quarantine", slug), viewed);
  const record: RegistryInstall = {
    slug, version: viewed.version, source: viewed.source, sha256: viewed.sha256, installedSha256: viewed.sha256,
    files: fileRecords(viewed), status: "disabled", updatedAt: (opts.now ?? new Date()).toISOString(),
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
  const activeDir = current.status === "active" ? join(skillsDir(env), slug) : homePath(env, "skill-registry-quarantine", slug);
  const existing = await readFile(join(activeDir, "SKILL.md"), "utf8"), diff = packageDiff(current, viewed, existing);
  if (!opts.confirmed) return { status: "preview", diff };
  if (await packageModified(activeDir, current)) {
    await writePackage(homePath(env, "skill-registry-updates", slug, viewed.version), viewed);
    await audit(env, "update-conflict", current);
    return { status: "local-edits-preserved", diff };
  }
  await replacePackage({ env, slug, current, activeDir, viewed });
  installs[index] = { ...current, version: viewed.version, source: viewed.source, sha256: viewed.sha256,
    installedSha256: viewed.sha256, files: fileRecords(viewed), updatedAt: new Date().toISOString() };
  await saveInstalls(env, installs); await audit(env, "update", installs[index]!);
  return { status: "updated", diff };
}

async function replacePackage(opts: { env: Env; slug: string; current: RegistryInstall; activeDir: string; viewed: ViewedSkill }): Promise<void> {
  const { env, slug, current, activeDir, viewed } = opts, stage = homePath(env, "skill-registry-stage", `${slug}-${process.pid}`);
  const backup = await saveBackup(env, slug, current, activeDir);
  await rm(stage, { recursive: true, force: true }); await writePackage(stage, viewed); await rm(activeDir, { recursive: true, force: true });
  try { await mkdir(dirname(activeDir), { recursive: true }); await rename(stage, activeDir); }
  catch (error) { await cp(backup, activeDir, { recursive: true }); throw error; }
}

async function saveBackup(env: Env, slug: string, record: RegistryInstall, activeDir: string): Promise<string> {
  const backup = homePath(env, "skill-registry-backups", slug, record.version);
  await rm(backup, { recursive: true, force: true }); await mkdir(dirname(backup), { recursive: true }); await cp(activeDir, backup, { recursive: true });
  await writePrivate(homePath(env, "skill-registry-backup-records", slug, `${record.version}.json`), `${JSON.stringify(record, null, 2)}\n`);
  return backup;
}

export async function rollbackRegistrySkill(slug: string, version: string, env: Env = process.env): Promise<RegistryInstall> {
  const installs = await readInstalls(env), index = installs.findIndex((item) => item.slug === slug && item.status !== "removed");
  if (index < 0) throw new Error(`registry skill ${slug} is not installed`);
  const current = installs[index]!, backup = homePath(env, "skill-registry-backups", slug, version);
  const raw = JSON.parse(await readFile(homePath(env, "skill-registry-backup-records", slug, `${version}.json`), "utf8"));
  const restored = RegistryInstallSchema.parse(raw), activeDir = current.status === "active" ? join(skillsDir(env), slug) : homePath(env, "skill-registry-quarantine", slug);
  await readFile(join(backup, "SKILL.md")); await saveBackup(env, slug, current, activeDir);
  const stage = homePath(env, "skill-registry-stage", `${slug}-rollback-${process.pid}`);
  await rm(stage, { recursive: true, force: true }); await cp(backup, stage, { recursive: true }); await rm(activeDir, { recursive: true, force: true }); await rename(stage, activeDir);
  const updated = { ...restored, status: current.status, updatedAt: new Date().toISOString() };
  installs[index] = updated; await saveInstalls(env, installs); await audit(env, "rollback", updated);
  return updated;
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
    const dir = item.status === "active" ? join(skillsDir(env), item.slug) : homePath(env, "skill-registry-quarantine", item.slug);
    const files = item.files.length ? item.files : [{ path: "SKILL.md", sha256: item.installedSha256 }];
    const actual = await Promise.all(files.map((file) => readFile(join(dir, file.path)).then(hash).catch(() => "missing")));
    results.push({ slug: item.slug, status: actual.includes("missing") ? "missing" : actual.every((value, i) => value === files[i]?.sha256) ? "ok" : "modified" });
  }
  return results;
}

async function requiredView(slug: string, env: Env): Promise<ViewedSkill> {
  const viewed = await viewRegistrySkill(slug, env);
  if (!viewed) throw new Error(`registry skill ${slug} not found`);
  if (!viewed.integrityOk) throw new Error(`integrity mismatch for ${slug}`);
  return viewed;
}

async function writePrivate(path: string, content: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, content, { mode: 0o600 });
}

async function writePackage(root: string, viewed: ViewedSkill): Promise<void> {
  for (const file of viewed.packageFiles) await writePrivate(join(root, file.path), file.bytes);
}

function fileRecords(viewed: ViewedSkill): Array<{ path: string; sha256: string }> {
  return viewed.packageFiles.map((file) => ({ path: file.path, sha256: file.sha256 }));
}

async function packageModified(root: string, record: RegistryInstall): Promise<boolean> {
  const files = record.files.length ? record.files : [{ path: "SKILL.md", sha256: record.installedSha256 }];
  for (const file of files) if (await readFile(join(root, file.path)).then(hash).catch(() => "missing") !== file.sha256) return true;
  return false;
}

function packageDiff(current: RegistryInstall, viewed: ViewedSkill, existing: string): string {
  const prior = current.files.length ? current.files : [{ path: "SKILL.md", sha256: current.installedSha256 }];
  const before = new Map(prior.map((file) => [file.path, file.sha256])), after = new Map(fileRecords(viewed).map((file) => [file.path, file.sha256]));
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((path) => before.get(path) !== after.get(path));
  return [lineDiff(existing, viewed.content), ...changed.filter((path) => path !== "SKILL.md").map((path) => `~${path}`)].join("\n");
}

function packageRisks(content: string, files: ViewedFile[]): string[] {
  const risks = files.filter((file) => file.executable).map((file) => `executable: ${file.path}`);
  const scripts = files.filter((file) => file.executable).map((file) => file.bytes.toString("utf8")).join("\n");
  const setup = `${content}\n${scripts}`.match(/\b(?:npm|pnpm|yarn|pip|pipx|brew|apt(?:-get)?)\s+install\b/gi) ?? [];
  risks.push(...setup.map((command) => `setup command: ${command.toLowerCase()}`));
  risks.push(...scanForInjection(`${content}\n${scripts}`).hits.map((hit) => `injection scan: ${hit}`));
  return [...new Set(risks)];
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
