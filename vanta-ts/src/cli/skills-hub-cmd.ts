import { addHubTap, inspectHub, listHubTaps, materializeHub, removeHubTap, searchHub, type HubSource } from "../skills/hub.js";
import { installRegistrySkill, viewRegistrySkill } from "../skills/registry-client.js";

export type HubCliContext = { env: NodeJS.ProcessEnv; fetcher: typeof fetch; log: (line: string) => void };
const SOURCES: HubSource[] = ["official", "url", "well-known", "github", "skills-sh", "tap"];

export async function runSkillsHubCommand(args: string[], ctx: HubCliContext): Promise<number | null> {
  const action = args[0], source = option(args, "--source");
  if ((action === "browse" || action === "search") && source) return search(args, ctx, source);
  if (action === "inspect") return inspect(args[1], ctx);
  if (action === "tap") return tap(args.slice(1), ctx);
  if (action === "install" && args[1]?.includes(":")) return install(args[1], args.includes("--yes"), ctx);
  return null;
}

async function search(args: string[], ctx: HubCliContext, rawSources: string): Promise<number> {
  const sources = rawSources.split(",").map((value) => value.trim()) as HubSource[];
  if (sources.some((source) => !SOURCES.includes(source))) throw new Error(`unknown hub source; use ${SOURCES.join(",")}`);
  const query = args[0] === "search" ? positional(args.slice(1)).join(" ") : "";
  const report = await searchHub({ query, sources, env: ctx.env, fetcher: ctx.fetcher });
  for (const item of report.skills) ctx.log(`${item.identifier}\t${item.version}\t${item.description}\t${item.category ?? "uncategorized"}\t${item.signature}\t${item.integrity}\tcache=${item.cache.status}@${item.cache.expiresAt}\t${item.provenance}`);
  for (const failure of report.failures) ctx.log(`source failure\t${failure.source}\t${failure.error}`);
  if (!report.skills.length) ctx.log("(no matching hub skills)");
  return report.failures.length && !report.skills.length ? 1 : 0;
}

async function inspect(identifier: string | undefined, ctx: HubCliContext): Promise<number> {
  if (!identifier) throw new Error("inspect needs a source-qualified identifier");
  const bundle = await inspectHub(identifier, { candidates: [], env: ctx.env, fetcher: ctx.fetcher });
  ctx.log([`${bundle.skill.identifier} - ${bundle.skill.description}`, `provenance: ${bundle.skill.provenance}`,
    `category: ${bundle.skill.category ?? "uncategorized"}`, `signature: ${bundle.skill.signature}`, `integrity: ${bundle.skill.integrity}`,
    "package files:", ...[...bundle.files].map(([path, bytes]) => `  ${path}\t${bytes.byteLength} bytes`),
    "", "Complete SKILL.md:", bundle.files.get("SKILL.md")?.toString("utf8") ?? "(provided by configured official registry)"].join("\n"));
  return 0;
}

async function install(identifier: string, confirmed: boolean, ctx: HubCliContext): Promise<number> {
  const materialized = await materializeHub(identifier, { candidates: [], env: ctx.env, fetcher: ctx.fetcher });
  const env = { ...ctx.env, VANTA_SKILL_REGISTRY: materialized.registryPath }, item = await viewRegistrySkill(materialized.slug, env);
  if (!item) throw new Error(`materialized hub skill ${identifier} is missing`);
  ctx.log(`${identifier}\nprovenance: ${item.source}\npackage files:\n${item.packageFiles.map((file) => `  ${file.path}\t${file.bytes.byteLength} bytes\t${file.sha256}`).join("\n")}\nrisks: ${item.risks.join("; ") || "none detected"}\n\nComplete SKILL.md:\n${item.content}`);
  if (!confirmed) { ctx.log(`Preview only: rerun with --yes to install ${identifier} disabled in quarantine.`); return 0; }
  const record = await installRegistrySkill(materialized.slug, { env, confirmed: true });
  ctx.log(`installed ${record.slug} ${record.version} disabled; review then run vanta skills approve ${record.slug} --yes`); return 0;
}

async function tap(args: string[], ctx: HubCliContext): Promise<number> {
  if (args[0] === "add") return tapAdd(args, ctx);
  if (args[0] === "remove") return tapRemove(args, ctx);
  if (args[0] === "list") return tapList(ctx);
  throw new Error("tap usage: vanta skills tap add|remove <owner/repo> [path] | tap list");
}

async function tapAdd(args: string[], ctx: HubCliContext): Promise<number> {
  if (!args[1]) throw new Error("tap add needs owner/repo");
  const path = args[2] ?? "skills"; await addHubTap({ repo: args[1], path }, ctx.env); ctx.log(`added tap ${args[1]}\t${path}`); return 0;
}

async function tapRemove(args: string[], ctx: HubCliContext): Promise<number> {
  if (!args[1]) throw new Error("tap remove needs owner/repo");
  const path = args[2] ?? "skills", removed = await removeHubTap(args[1], path, ctx.env);
  ctx.log(`${removed ? "removed" : "missing"} tap ${args[1]}\t${path}`); return removed ? 0 : 1;
}

async function tapList(ctx: HubCliContext): Promise<number> {
  const taps = await listHubTaps(ctx.env); for (const item of taps) ctx.log(`${item.repo}\t${item.path}`);
  if (!taps.length) ctx.log("(no skill taps)"); return 0;
}

function option(args: string[], name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function positional(args: string[]): string[] { const index = args.indexOf("--source"); return index < 0 ? args : args.filter((_value, i) => i !== index && i !== index + 1); }
