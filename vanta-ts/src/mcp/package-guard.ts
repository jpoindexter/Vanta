// Local package deny-list for MCP servers launched through a package runner.
//
// Before Vanta spawns `npx foo`, `uvx foo`, `pnpm dlx foo`, ... it checks `foo`
// against a list of known-bad packages and refuses the launch. The list is LOCAL:
// a small shipped seed (package-guard-default.ts) merged with an owner-editable
// file at <VANTA_HOME>/mcp-package-denylist.json. Nothing here makes a network
// call and nothing here ever should: Vanta does not phone home, so there is no
// advisory lookup, only what is written down on this machine.
//
// A denied launch is refused BEFORE any approval prompt, so it can never be
// approved, remembered, or covered by an "Always allow" rule.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { SHIPPED_DENY_LIST } from "./package-guard-default.js";
import { normalizePypiName, parsePackageLaunch, type PackageSpec } from "./package-spec.js";

export const USER_DENY_LIST_FILE = "mcp-package-denylist.json";
const SHIPPED_DENY_LIST_SOURCE = "vanta-ts/src/mcp/package-guard-default.ts";

const EntrySchema = z.object({
  ecosystem: z.enum(["npm", "pypi"]),
  name: z.string().min(1),
  versions: z.array(z.string().min(1)).min(1).optional(),
  reason: z.string().min(1),
}).strict();

const FileSchema = z.object({
  version: z.literal(1),
  packages: z.array(EntrySchema),
}).strict();

export type DenyListFile = z.infer<typeof FileSchema>;
export type DenyEntry = z.infer<typeof EntrySchema>;
/** A deny entry plus where it came from, so the refusal can say where to edit. */
export type ListedEntry = DenyEntry & { source: "shipped" | "user"; file: string };

export type PackageCheck =
  | { ok: true }
  | { ok: false; reason: string; matched: ListedEntry };

export type DenyListLoad =
  | { ok: true; entries: ListedEntry[] }
  | { ok: false; error: string };

export function userDenyListPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), USER_DENY_LIST_FILE);
}

function normalizeName(entry: DenyEntry): string {
  return entry.ecosystem === "pypi" ? normalizePypiName(entry.name) : entry.name.toLowerCase();
}

function toListed(list: DenyListFile, source: ListedEntry["source"], file: string): ListedEntry[] {
  return list.packages.map((entry) => ({ ...entry, name: normalizeName(entry), source, file }));
}

/** Parse a list file's JSON text. The error names the file and the first problem. */
export function parseDenyList(text: string, file: string): { ok: true; list: DenyListFile } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `${file} is not valid JSON (${(err as Error).message}). Fix the syntax or delete the file; it is read on every package-runner launch.` };
  }
  const parsed = FileSchema.safeParse(json);
  if (parsed.success) return { ok: true, list: parsed.data };
  const issue = parsed.error.issues[0];
  const where = issue && issue.path.length > 0 ? issue.path.join(".") : "(top level)";
  return { ok: false, error: `${file} is not a valid MCP package deny-list: ${where}: ${issue?.message ?? "invalid"}. Expected {"version":1,"packages":[{"ecosystem":"npm"|"pypi","name":"...","reason":"...","versions":["..."]?}]}.` };
}

/** Shipped seed merged with the owner's file. A missing user file is fine; a malformed one is an error. */
export function loadDenyList(env: NodeJS.ProcessEnv): DenyListLoad {
  const shipped = toListed(SHIPPED_DENY_LIST, "shipped", SHIPPED_DENY_LIST_SOURCE);
  const file = userDenyListPath(env);
  if (!existsSync(file)) return { ok: true, entries: shipped };
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    return { ok: false, error: `${file} could not be read (${(err as Error).message}). Fix its permissions or delete it.` };
  }
  const parsed = parseDenyList(text, file);
  if (!parsed.ok) return parsed;
  return { ok: true, entries: [...shipped, ...toListed(parsed.list, "user", file)] };
}

function entryMatches(spec: PackageSpec, entry: ListedEntry): boolean {
  if (entry.ecosystem !== spec.ecosystem || entry.name !== spec.name) return false;
  if (!entry.versions) return true;
  // A version-scoped entry names exact releases. An unpinned launch resolves to a
  // version only the registry knows, so it cannot be judged offline; the approval
  // prompt flags it as unpinned instead.
  return spec.version !== undefined && entry.versions.includes(spec.version.replace(/^v/, ""));
}

function describeSpec(spec: PackageSpec): string {
  return `${spec.name}${spec.version ? `@${spec.version}` : ""}`;
}

/** Pure: is this package on the given list? */
export function checkPackage(spec: PackageSpec, entries: readonly ListedEntry[]): PackageCheck {
  const matched = entries.find((entry) => entryMatches(spec, entry));
  if (!matched) return { ok: true };
  const scope = matched.versions ? ` (listed versions: ${matched.versions.join(", ")})` : "";
  return {
    ok: false,
    matched,
    reason: `package "${describeSpec(spec)}" (${spec.ecosystem}) is on the Vanta package deny-list${scope}: ${matched.reason}`,
  };
}

function editHint(matched: ListedEntry, env: NodeJS.ProcessEnv): string {
  const userFile = userDenyListPath(env);
  return matched.source === "user"
    ? `This entry is in your list, ${matched.file}. Edit that file to change it.`
    : `This entry ships with Vanta (${matched.file}). Your own entries go in ${userFile}.`;
}

export type LaunchGuard =
  | { ok: true; packages: PackageSpec[] }
  | { ok: false; error: string };

/**
 * Guard a stdio launch. Non-package-runner commands pass without touching the list,
 * so a broken user file only affects launches that actually fetch a package.
 * The error is the full operator-facing message; callers show it as-is.
 */
export function guardLaunch(command: string, args: readonly string[], env: NodeJS.ProcessEnv): LaunchGuard {
  const packages = parsePackageLaunch(command, args);
  if (packages.length === 0) return { ok: true, packages };
  const list = loadDenyList(env);
  if (!list.ok) return { ok: false, error: `Refused to launch "${command}": ${list.error}` };
  for (const spec of packages) {
    const verdict = checkPackage(spec, list.entries);
    if (!verdict.ok) {
      return {
        ok: false,
        error: `Refused to launch MCP server: ${verdict.reason}. This launch cannot be approved. ${editHint(verdict.matched, env)} Vanta checks this list on this machine only; no registry or advisory host is contacted.`,
      };
    }
  }
  return { ok: true, packages };
}
