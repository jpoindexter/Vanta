import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveVantaHome, slugifySkillName } from "../store/home.js";
import { fromAgentSkills } from "./agentskills-format.js";
import { browseRegistry } from "./registry-client.js";

export type HubSource = "official" | "url" | "well-known" | "github" | "skills-sh" | "tap";
type CacheStatus = "fresh" | "stale-offline";
export type HubSkill = {
  source: HubSource; identifier: string; slug: string; name: string; description: string; version: string;
  provenance: string; category?: string; signature: "verified" | "present-unverified" | "unsigned";
  integrity: "source-declared" | "content-hashed" | "unverified"; registryLocation?: string; packageId?: string;
  cache: { status: CacheStatus; fetchedAt: string; expiresAt: string };
};
type HubFailure = { source: HubSource; error: string };
type Tap = { repo: string; path: string };
type Deps = { env: NodeJS.ProcessEnv; fetcher: typeof fetch; now: Date; ttlMs: number };
type SearchOpts = { query: string; sources: HubSource[]; env?: NodeJS.ProcessEnv; fetcher?: typeof fetch; now?: Date; ttlMs?: number };
type InspectOpts = { candidates: HubSkill[]; env?: NodeJS.ProcessEnv; fetcher?: typeof fetch };
export type HubPackage = { skill: HubSkill; files: Map<string, Buffer> };

const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const MAX_FILES = 65, MAX_FILE_BYTES = 512 * 1024, MAX_PACKAGE_BYTES = 2 * 1024 * 1024;
const DEFAULT_GITHUB_TAPS: Tap[] = [
  { repo: "openai/skills", path: "skills/.curated" }, { repo: "openai/skills", path: "skills/.system" },
  { repo: "anthropics/skills", path: "skills" }, { repo: "huggingface/skills", path: "skills" }, { repo: "NVIDIA/skills", path: "skills" },
];
const cacheRoot = (env: NodeJS.ProcessEnv) => join(resolveVantaHome(env), "skill-hub-cache");
const tapsPath = (env: NodeJS.ProcessEnv) => join(resolveVantaHome(env), "skill-hub-taps.json");
const defaults = (opts: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch; now?: Date; ttlMs?: number }): Deps => ({
  env: opts.env ?? process.env, fetcher: opts.fetcher ?? fetch, now: opts.now ?? new Date(), ttlMs: opts.ttlMs ?? 60 * 60 * 1000,
});

export async function addHubTap(tap: Tap, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(tap.repo) || tap.path.split("/").includes("..")) throw new Error("invalid GitHub tap");
  const taps = await listHubTaps(env), next = [...taps.filter((item) => item.repo !== tap.repo || item.path !== tap.path), tap];
  await mkdir(dirname(tapsPath(env)), { recursive: true }); await writeFile(tapsPath(env), `${JSON.stringify({ version: 1, taps: next }, null, 2)}\n`, "utf8");
}

export async function listHubTaps(env: NodeJS.ProcessEnv = process.env): Promise<Tap[]> {
  try {
    const raw = JSON.parse(await readFile(tapsPath(env), "utf8")) as { taps?: Tap[] };
    return (raw.taps ?? []).filter((tap) => /^[\w.-]+\/[\w.-]+$/.test(tap.repo) && !tap.path.split("/").includes(".."));
  } catch { return []; }
}

export async function removeHubTap(repo: string, path: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const taps = await listHubTaps(env), next = taps.filter((item) => item.repo !== repo || item.path !== path);
  if (next.length === taps.length) return false;
  await writeFile(tapsPath(env), `${JSON.stringify({ version: 1, taps: next }, null, 2)}\n`, "utf8"); return true;
}

export async function searchHub(opts: SearchOpts): Promise<{ skills: HubSkill[]; failures: HubFailure[] }> {
  const deps = defaults(opts), skills: HubSkill[] = [], failures: HubFailure[] = [];
  await Promise.all(opts.sources.map(async (source) => {
    const cached = await readCache(source, opts.query, deps);
    if (cached?.fresh) { skills.push(...cached.skills); return; }
    try {
      const found = await searchSource(source, opts.query, deps), stamped = stamp(found, "fresh", deps);
      await writeCache(source, opts.query, stamped, deps); skills.push(...stamped);
    } catch (error) {
      if (cached) skills.push(...stamp(cached.skills, "stale-offline", deps, cached.fetchedAt));
      else failures.push({ source, error: (error as Error).message });
    }
  }));
  return { skills: skills.sort((a, b) => a.identifier.localeCompare(b.identifier)), failures: failures.sort((a, b) => a.source.localeCompare(b.source)) };
}

async function searchSource(source: HubSource, query: string, deps: Deps): Promise<HubSkill[]> {
  if (source === "official") return filterSkills(await searchOfficial(deps), query);
  if (source === "url") return [await inspectUrl(deps.env.VANTA_SKILL_URL ?? query, source, deps)];
  if (source === "well-known") return searchWellKnown(query, deps);
  if (source === "skills-sh") return searchSkillsSh(query, deps);
  if (source === "github") return searchGitHub(query, deps);
  const groups = await Promise.all((await listHubTaps(deps.env)).map((tap) => listGitHubTap(tap, deps)));
  return filterSkills(groups.flat(), query);
}

async function searchGitHub(query: string, deps: Deps): Promise<HubSkill[]> {
  const exact = deps.env.VANTA_SKILL_GITHUB;
  if (exact) return [await inspectGitHub(exact, "github", deps)];
  const groups = await Promise.all(DEFAULT_GITHUB_TAPS.map((tap) => listGitHubTapMetadata(tap, deps)));
  return filterSkills(groups.flat(), query);
}

async function listGitHubTapMetadata(tap: Tap, deps: Deps): Promise<HubSkill[]> {
  const tree = await githubTree(tap.repo, deps), prefix = tap.path.replace(/^\/|\/$/g, "");
  return tree.paths.filter((path) => path.endsWith("/SKILL.md") && path.startsWith(`${prefix}/`)).slice(0, 200).map((path) => {
    const dir = path.slice(0, -9), name = dir.split("/").at(-1)!;
    return skill({ source: "github", id: `${tap.repo}/${dir}`, name, description: `GitHub skill from ${tap.repo}`,
      provenance: `https://github.com/${tap.repo}/tree/${tree.branch}/${dir}`, signature: tree.paths.includes(`${dir}/skill.oms.sig`) ? "present-unverified" : "unsigned" });
  });
}

function filterSkills(skills: HubSkill[], query: string): HubSkill[] {
  const needle = query.trim().toLowerCase();
  return needle && !/^https?:\/\//.test(needle) ? skills.filter((item) => `${item.name} ${item.description} ${item.category ?? ""}`.toLowerCase().includes(needle)) : skills;
}

async function searchOfficial(deps: Deps): Promise<HubSkill[]> {
  if (!deps.env.VANTA_SKILL_REGISTRY) throw new Error("VANTA_SKILL_REGISTRY is not configured");
  return (await browseRegistry(deps.env)).map((item) => skill({ source: "official", id: item.slug, name: item.name, description: item.description,
    version: item.version, provenance: deps.env.VANTA_SKILL_REGISTRY!, registryLocation: deps.env.VANTA_SKILL_REGISTRY, integrity: "source-declared" }));
}

async function searchWellKnown(query: string, deps: Deps): Promise<HubSkill[]> {
  const index = wellKnownIndex(query), data = await json(index, deps.fetcher) as { skills?: Array<{ name?: string; description?: string; version?: string }> };
  if (!Array.isArray(data.skills)) throw new Error("well-known index has no skills");
  const base = index.slice(0, -"index.json".length);
  return data.skills.flatMap((item) => item.name ? [skill({ source: "well-known", id: `${base}${item.name}`, name: item.name,
    description: item.description ?? "", version: item.version, provenance: index })] : []);
}

async function searchSkillsSh(query: string, deps: Deps): Promise<HubSkill[]> {
  const url = `https://skills.sh/api/search?q=${encodeURIComponent(query)}&limit=50`, data = await json(url, deps.fetcher) as { skills?: unknown[] };
  if (!Array.isArray(data.skills)) throw new Error("skills.sh returned no skills");
  return data.skills.flatMap((raw) => normalizeSkillsSh(raw, url));
}

function normalizeSkillsSh(raw: unknown, provenance: string): HubSkill[] {
  const item = raw as Record<string, unknown>, { owner, repo, path } = skillsShCoordinates(item);
  if (!owner || !repo || !path) return [];
  return [skill({ source: "skills-sh", id: `${owner}/${repo}/${path}`, name: firstString(item, ["name"]) || path.split("/").at(-1)!,
    description: firstString(item, ["description"]) || skillsShDescription(item.installs), provenance })];
}

function skillsShCoordinates(item: Record<string, unknown>): { owner: string; repo: string; path: string } {
  const id = firstString(item, ["id"]).split("/"), source = firstString(item, ["source"]).split("/");
  return { owner: firstString(item, ["owner"]) || id[0] || source[0] || "", repo: firstString(item, ["repo"]) || id[1] || source[1] || "",
    path: firstString(item, ["skill", "path", "skillId"]) || id.slice(2).join("/") || firstString(item, ["name"]) };
}

const skillsShDescription = (installs: unknown) => typeof installs === "number" ? `Indexed by skills.sh (${installs} installs)` : "Indexed by skills.sh";

function firstString(item: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) if (typeof item[key] === "string") return item[key] as string;
  return "";
}

async function inspectUrl(url: string, source: HubSource, deps: Deps): Promise<HubSkill> {
  if (!/^https?:\/\//.test(url)) throw new Error("URL source needs an HTTP(S) SKILL.md URL");
  const content = await text(url, deps.fetcher), parsed = fromAgentSkills(content, deps.now.toISOString());
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error("hub package file exceeds 512 KiB");
  return skill({ source, id: url, name: parsed.meta.name || url.split("/").at(-2) || "skill", description: parsed.meta.description,
    version: extractVersion(content), provenance: url });
}

async function inspectGitHub(id: string, source: HubSource, deps: Deps): Promise<HubSkill> {
  const parsed = githubId(id), tree = await githubTree(parsed.repo, deps), prefix = parsed.path.replace(/\/$/, "");
  if (!tree.paths.includes(`${prefix}/SKILL.md`)) throw new Error(`GitHub skill ${id} has no SKILL.md`);
  const content = await text(rawUrl(parsed.repo, tree.branch, `${prefix}/SKILL.md`), deps.fetcher), meta = fromAgentSkills(content, deps.now.toISOString());
  const category = await githubCategory(parsed.repo, tree.branch, meta.meta.name || prefix.split("/").at(-1)!, deps).catch(() => undefined);
  return skill({ source, id, name: meta.meta.name || prefix.split("/").at(-1)!, description: meta.meta.description,
    version: extractVersion(content), provenance: `https://github.com/${parsed.repo}/tree/${tree.branch}/${prefix}`, category,
    signature: tree.paths.includes(`${prefix}/skill.oms.sig`) ? "present-unverified" : "unsigned" });
}

async function listGitHubTap(tap: Tap, deps: Deps): Promise<HubSkill[]> {
  const tree = await githubTree(tap.repo, deps), prefix = tap.path.replace(/^\/|\/$/g, "");
  const dirs = tree.paths.filter((path) => path.endsWith("/SKILL.md") && (!prefix || path.startsWith(`${prefix}/`))).map((path) => path.slice(0, -9));
  return Promise.all(dirs.map((path) => inspectGitHub(`${tap.repo}/${path}`, "tap", deps)));
}

export async function inspectHub(identifier: string, opts: InspectOpts): Promise<HubPackage> {
  const matches = opts.candidates.filter((candidate) => candidate.identifier === identifier || candidate.slug === identifier);
  if (!identifier.includes(":") && matches.length > 1) throw new Error(`ambiguous skill ${identifier}; choose an explicit source identifier`);
  const selected = matches.find((item) => item.identifier === identifier) ?? matches[0] ?? await resolveHubIdentifier(identifier, defaults(opts));
  if (!selected) throw new Error(`hub skill ${identifier} not found`);
  return fetchPackage(selected, defaults(opts));
}

async function resolveHubIdentifier(identifier: string, deps: Deps): Promise<HubSkill | undefined> {
  const split = identifier.indexOf(":"), source = identifier.slice(0, split) as HubSource, raw = identifier.slice(split + 1);
  if (split < 1 || !["official", "url", "well-known", "github", "skills-sh", "tap"].includes(source)) return undefined;
  if (source === "url") return inspectUrl(raw, source, deps);
  if (source === "skills-sh") return inspectSkillsSh(raw, deps);
  if (["github", "tap"].includes(source)) return inspectGitHub(raw, source, deps);
  if (source === "official") return (await searchOfficial(deps)).find((item) => item.identifier === identifier);
  const slash = raw.lastIndexOf("/"), base = raw.slice(0, slash), found = await searchWellKnown(base.replace(/\/\.well-known\/skills$/, ""), deps);
  return found.find((item) => item.identifier === identifier);
}

async function inspectSkillsSh(raw: string, deps: Deps): Promise<HubSkill> {
  const parsed = githubId(raw), tree = await githubTree(parsed.repo, deps), alias = parsed.path.split("/").at(-1)!;
  const direct = [parsed.path, `skills/${alias}`, `.agents/skills/${alias}`, `.claude/skills/${alias}`]
    .find((path) => tree.paths.includes(`${path}/SKILL.md`));
  const canonical = direct ?? await findFrontmatterAlias(parsed.repo, tree, alias, deps);
  if (!canonical) throw new Error(`skills.sh alias ${raw} did not resolve to a GitHub package`);
  const found = await inspectGitHub(`${parsed.repo}/${canonical}`, "skills-sh", deps);
  return { ...found, identifier: `skills-sh:${raw}`, packageId: `${parsed.repo}/${canonical}` };
}

async function findFrontmatterAlias(repo: string, tree: { branch: string; paths: string[] }, alias: string, deps: Deps): Promise<string | undefined> {
  const candidates = tree.paths.filter((path) => path.endsWith("/SKILL.md")).slice(0, 200);
  for (const path of candidates) {
    const body = await text(rawUrl(repo, tree.branch, path), deps.fetcher), meta = fromAgentSkills(body, deps.now.toISOString());
    if (meta.meta.name === alias) return path.slice(0, -9);
  }
  return undefined;
}

export async function materializeHub(identifier: string, opts: InspectOpts): Promise<{ slug: string; registryPath: string }> {
  const bundle = await inspectHub(identifier, opts);
  if (bundle.skill.registryLocation) return { slug: bundle.skill.slug, registryPath: bundle.skill.registryLocation };
  const root = join(cacheRoot(defaults(opts).env), "packages", sha(bundle.skill.identifier).slice(0, 16)), packageDir = join(root, "package");
  await rm(root, { recursive: true, force: true });
  for (const [path, bytes] of bundle.files) { safePath(path); await mkdir(dirname(join(packageDir, path)), { recursive: true }); await writeFile(join(packageDir, path), bytes, { mode: 0o600 }); }
  const main = bundle.files.get("SKILL.md"); if (!main) throw new Error("hub package has no SKILL.md");
  const companions = [...bundle.files].filter(([path]) => path !== "SKILL.md").map(([path, bytes]) => ({ path, source: `package/${path}`, sha256: sha(bytes), bytes: bytes.byteLength, executable: executable(path) }));
  const index = { version: 1, skills: [{ slug: bundle.skill.slug, name: bundle.skill.name, version: bundle.skill.version,
    description: bundle.skill.description || "Imported hub skill", source: "package/SKILL.md", sha256: sha(main), capabilities: [], platforms: [], dependencies: [], files: companions }] };
  await writeFile(join(root, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return { slug: bundle.skill.slug, registryPath: join(root, "index.json") };
}

async function fetchPackage(selected: HubSkill, deps: Deps): Promise<HubPackage> {
  if (selected.source === "official") return { skill: selected, files: new Map() };
  if (selected.source === "url") return boundedPackage(selected, new Map([["SKILL.md", Buffer.from(await text(selected.identifier.slice(4), deps.fetcher))]]));
  if (selected.source === "well-known") return fetchWellKnown(selected, deps);
  const raw = selected.packageId ?? selected.identifier.slice(selected.identifier.indexOf(":") + 1), parsed = githubId(raw), tree = await githubTree(parsed.repo, deps), prefix = parsed.path.replace(/\/$/, "");
  const paths = tree.paths.filter((path) => path.startsWith(`${prefix}/`) && !path.endsWith("/"));
  if (paths.length > MAX_FILES) throw new Error(`hub package exceeds ${MAX_FILES} files`);
  const files = new Map<string, Buffer>();
  for (const path of paths) { const rel = path.slice(prefix.length + 1); safePath(rel); files.set(rel, Buffer.from(await text(rawUrl(parsed.repo, tree.branch, path), deps.fetcher))); assertBundleBounds(files); }
  return boundedPackage(selected, files);
}

async function fetchWellKnown(selected: HubSkill, deps: Deps): Promise<HubPackage> {
  const endpoint = selected.identifier.slice("well-known:".length), slash = endpoint.lastIndexOf("/"), index = `${endpoint.slice(0, slash)}/index.json`;
  const data = await json(index, deps.fetcher) as { skills?: Array<{ name?: string; files?: string[] }> }, name = endpoint.slice(slash + 1);
  const entry = data.skills?.find((item) => item.name === name), paths = entry?.files?.length ? entry.files : ["SKILL.md"], files = new Map<string, Buffer>();
  if (paths.length > MAX_FILES) throw new Error(`hub package exceeds ${MAX_FILES} files`);
  for (const path of paths) { safePath(path); files.set(path, Buffer.from(await text(`${endpoint}/${path}`, deps.fetcher))); assertBundleBounds(files); }
  return boundedPackage(selected, files);
}

function boundedPackage(skill: HubSkill, files: Map<string, Buffer>): HubPackage {
  assertBundleBounds(files); return { skill: { ...skill, integrity: "content-hashed" }, files };
}

function assertBundleBounds(files: Map<string, Buffer>): void {
  if (files.size > MAX_FILES) throw new Error(`hub package exceeds ${MAX_FILES} files`);
  if ([...files.values()].some((bytes) => bytes.byteLength > MAX_FILE_BYTES)) throw new Error("hub package file exceeds 512 KiB");
  if ([...files.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0) > MAX_PACKAGE_BYTES) throw new Error("hub package exceeds 2 MiB");
}

function skill(input: { source: HubSource; id: string; name: string; description: string; provenance: string; version?: string; category?: string; signature?: HubSkill["signature"]; integrity?: HubSkill["integrity"]; registryLocation?: string; packageId?: string }): HubSkill {
  return { source: input.source, identifier: `${input.source}:${input.id}`, slug: slugifySkillName(input.name), name: input.name,
    description: input.description, version: input.version ?? "unversioned", provenance: input.provenance, category: input.category,
    signature: input.signature ?? "unsigned", integrity: input.integrity ?? "unverified", registryLocation: input.registryLocation, packageId: input.packageId,
    cache: { status: "fresh", fetchedAt: "", expiresAt: "" } };
}

function stamp(skills: HubSkill[], status: CacheStatus, deps: Deps, fetchedAt = deps.now.toISOString()): HubSkill[] {
  const expiresAt = new Date(new Date(fetchedAt).getTime() + deps.ttlMs).toISOString();
  return skills.map((item) => ({ ...item, cache: { status, fetchedAt, expiresAt } }));
}

async function readCache(source: HubSource, query: string, deps: Deps): Promise<{ skills: HubSkill[]; fresh: boolean; fetchedAt: string } | null> {
  try { const raw = JSON.parse(await readFile(cacheFile(source, query, deps.env), "utf8")) as { skills: HubSkill[]; fetchedAt: string; expiresAt: string };
    return { skills: raw.skills, fetchedAt: raw.fetchedAt, fresh: new Date(raw.expiresAt) > deps.now }; } catch { return null; }
}

async function writeCache(source: HubSource, query: string, skills: HubSkill[], deps: Deps): Promise<void> {
  const path = cacheFile(source, query, deps.env), first = skills[0]?.cache;
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify({ fetchedAt: first?.fetchedAt, expiresAt: first?.expiresAt, skills }), "utf8");
}

const cacheFile = (source: HubSource, query: string, env: NodeJS.ProcessEnv) => join(cacheRoot(env), "search", `${source}-${sha(query).slice(0, 16)}.json`);
const wellKnownIndex = (query: string) => query.endsWith("index.json") ? query : `${query.replace(/\/$/, "")}/.well-known/skills/index.json`;
const rawUrl = (repo: string, branch: string, path: string) => `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
function githubId(id: string): { repo: string; path: string } { const raw = id.replace(/^(github|tap|skills-sh):/, ""), parts = raw.split("/"); if (parts.length < 3) throw new Error("GitHub skill needs owner/repo/path"); return { repo: `${parts[0]}/${parts[1]}`, path: parts.slice(2).join("/") }; }
async function githubTree(repo: string, deps: Deps): Promise<{ branch: string; paths: string[] }> { const info = await json(`https://api.github.com/repos/${repo}`, deps.fetcher) as { default_branch?: string }; const branch = info.default_branch ?? "main"; const tree = await json(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`, deps.fetcher) as { tree?: Array<{ type?: string; path?: string }> }; return { branch, paths: (tree.tree ?? []).flatMap((item) => item.type === "blob" && item.path ? [item.path] : []) }; }
async function githubCategory(repo: string, branch: string, name: string, deps: Deps): Promise<string | undefined> { const data = await json(rawUrl(repo, branch, "skills.sh.json"), deps.fetcher) as { groupings?: Array<{ title?: string; skills?: string[] }> }; return data.groupings?.find((group) => group.skills?.includes(name))?.title; }
async function text(url: string, fetcher: typeof fetch): Promise<string> { const response = await fetcher(url); if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`); return response.text(); }
async function json(url: string, fetcher: typeof fetch): Promise<unknown> { return JSON.parse(await text(url, fetcher)); }
function safePath(path: string): void { if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "..")) throw new Error(`unsafe package path: ${path}`); }
const executable = (path: string) => /(^|\/)(scripts?\/.*|.*\.(?:sh|bash|zsh|py|js|mjs|ps1|cmd|bat))$/i.test(path);
const extractVersion = (content: string) => /^\s*version:\s*["']?([^"'\n]+)["']?\s*$/m.exec(content)?.[1]?.trim() ?? "unversioned";
