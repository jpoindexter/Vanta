import {
  approveRegistrySkill, browseRegistry, doctorRegistrySkills, installRegistrySkill,
  removeRegistrySkill, rollbackRegistrySkill, searchRegistry, updateRegistrySkill, viewRegistrySkill,
} from "../skills/registry-client.js";

type Deps = { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch; log?: (line: string) => void };
type Context = { env: NodeJS.ProcessEnv; fetcher: typeof fetch; log: (line: string) => void };
const USAGE = "usage: vanta skills search <query> [--source <source>] | browse [--source <source>] | inspect <source:id> | view <slug> | install <slug|source:id> [--yes] | tap add|list | approve|update|rollback|remove|doctor";

export async function runSkillsRegistryCommand(args: string[], deps: Deps = {}): Promise<number> {
  const ctx = { env: deps.env ?? process.env, fetcher: deps.fetcher ?? fetch, log: deps.log ?? console.log };
  try { return await route(args, ctx); }
  catch (error) { ctx.log(`skill registry error: ${(error as Error).message}`); return 1; }
}

async function route(args: string[], ctx: Context): Promise<number> {
  const { runSkillsHubCommand } = await import("./skills-hub-cmd.js"), hub = await runSkillsHubCommand(args, ctx);
  if (hub !== null) return hub;
  return routeRegistry(args, ctx);
}

async function routeRegistry(args: string[], ctx: Context): Promise<number> {
  const action = args[0], slug = args[1];
  if (action === "browse") return printList(await browseRegistry(ctx.env), ctx.log);
  if (action === "search") return printList(await searchRegistry(args.slice(1).join(" "), ctx.env), ctx.log);
  if (action === "view") return view(slug, ctx);
  if (action === "install") return install(slug, args.includes("--yes"), ctx);
  if (action === "approve") return approve(slug, args.includes("--yes"), ctx);
  if (action === "update") return update(slug, args.includes("--yes"), ctx);
  if (action === "rollback") return rollback(slug, args[2], args.includes("--yes"), ctx);
  if (action === "remove") return remove(slug, args.includes("--yes"), ctx);
  if (action === "doctor") return doctor(ctx);
  ctx.log(USAGE); return 1;
}

function printList(items: Awaited<ReturnType<typeof browseRegistry>>, log: (line: string) => void): number {
  for (const item of items) log(`${item.slug}\t${item.version}\t${item.description}\t${item.capabilities.join(",") || "no capabilities"}`);
  if (!items.length) log("(no matching registry skills)");
  return 0;
}

async function view(slug: string | undefined, ctx: Context): Promise<number> {
  if (!slug) throw new Error("view needs a slug");
  const item = await viewRegistrySkill(slug, ctx.env);
  if (!item) throw new Error(`registry skill ${slug} not found`);
  ctx.log(formatView(item)); return item.integrityOk ? 0 : 1;
}

function formatView(item: NonNullable<Awaited<ReturnType<typeof viewRegistrySkill>>>): string {
  return [
    `${item.slug} ${item.version} - ${item.description}`, `source: ${item.source}`, `sha256: ${item.sha256} (${item.integrityOk ? "verified" : "MISMATCH"})`,
    `platforms: ${item.platforms.join(", ") || "any"}`, `dependencies: ${item.dependencies.join(", ") || "none"}`,
    `requested capabilities: ${item.capabilities.join(", ") || "none"}`,
    "package files:", ...item.packageFiles.map((file) => `  ${file.path}\t${file.bytes.byteLength} bytes\t${file.sha256}${file.executable ? "\texecutable" : ""}`),
    `risks: ${item.risks.join("; ") || "none detected"}`, "", "Complete SKILL.md:", item.content,
  ].join("\n");
}

async function install(slug: string | undefined, confirmed: boolean, ctx: Context): Promise<number> {
  if (!slug) throw new Error("install needs a slug");
  if (!confirmed) { await view(slug, ctx); ctx.log(`Preview only: rerun with --yes to install ${slug} disabled in quarantine.`); return 0; }
  const record = await installRegistrySkill(slug, { env: ctx.env, confirmed: true });
  ctx.log(`installed ${record.slug} ${record.version} disabled; review then run vanta skills approve ${slug} --yes`); return 0;
}

async function approve(slug: string | undefined, confirmed: boolean, ctx: Context): Promise<number> {
  if (!slug || !confirmed) throw new Error("approve needs a slug and --yes");
  const record = await approveRegistrySkill(slug, ctx.env);
  ctx.log(`approved ${record.slug} ${record.version}; skill is active`); return 0;
}

async function update(slug: string | undefined, confirmed: boolean, ctx: Context): Promise<number> {
  if (!slug) throw new Error("update needs a slug");
  const result = await updateRegistrySkill(slug, { env: ctx.env, confirmed });
  ctx.log(`${confirmed ? result.status : "update preview"} ${slug}\n${result.diff}`);
  if (!confirmed) ctx.log("Rerun with --yes after reviewing the diff.");
  return result.status === "local-edits-preserved" ? 2 : 0;
}

async function remove(slug: string | undefined, confirmed: boolean, ctx: Context): Promise<number> {
  if (!slug || !confirmed) throw new Error("remove needs a slug and --yes");
  await removeRegistrySkill(slug, ctx.env); ctx.log(`removed ${slug} reversibly into skill-registry-removed`); return 0;
}

async function rollback(slug: string | undefined, version: string | undefined, confirmed: boolean, ctx: Context): Promise<number> {
  if (!slug || !version || !confirmed) throw new Error("rollback needs a slug, version, and --yes");
  const record = await rollbackRegistrySkill(slug, version, ctx.env);
  ctx.log(`rolled back ${slug} to ${record.version}`); return 0;
}

async function doctor(ctx: Context): Promise<number> {
  const results = await doctorRegistrySkills(ctx.env);
  for (const item of results) ctx.log(`${item.slug}\t${item.status}`);
  if (!results.length) ctx.log("(no registry skills installed)");
  return results.some((item) => !["ok", "removed"].includes(item.status)) ? 1 : 0;
}
