import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { TrustRequest } from "../ui/trust-dialog.js";
import type { Settings } from "./store.js";
import {
  isProjectTrusted, hasProjectDecision, trustProject,
  isMcpTrusted, hasMcpDecision, trustMcp,
} from "./trust.js";

// Trust gate orchestration. Resolves whether a project's context may load and
// whether an MCP server may mount, asking the operator once (via an injected
// confirmer) and persisting the answer. With no confirmer (headless / non-TTY)
// the gate FAILS SAFE: an undecided project/server is treated as untrusted and
// is skipped — it never blocks or hangs.

/** Asks the operator to confirm a trust request; resolves true to trust. */
export type TrustConfirmer = (request: TrustRequest) => Promise<boolean>;

/** Truthy VANTA_TRUST_ALL values that flip the auto-trust lever via env. */
const TRUTHY = new Set(["1", "true", "yes", "on"]);

/**
 * Whether project context should be auto-trusted without prompting. True when
 * `VANTA_TRUST_ALL` is truthy OR `settings.trust.auto` is set — a single-operator
 * convenience for the operator's own repos. Pure; MCP trust is unaffected.
 */
export function trustAuto(env: NodeJS.ProcessEnv, settings?: Settings): boolean {
  const raw = env.VANTA_TRUST_ALL?.trim().toLowerCase();
  if (raw && TRUTHY.has(raw)) return true;
  return settings?.trust?.auto === true;
}

/** Optional inputs to the project trust gate: the auto-trust lever sources. */
export type ProjectTrustOpts = { env?: NodeJS.ProcessEnv; settings?: Settings };

// The same context files prompt.ts loads — kept in sync intentionally.
const CONTEXT_FILES = ["VANTA.md", "ARGO.md", "AGENTS.md", "CLAUDE.md", "README.md"];

async function readIfExists(path: string): Promise<string | null> {
  return readFile(path, "utf8").catch(() => null);
}

/** Collect the project's present context files for the trust preview. */
export async function collectContextFiles(root: string): Promise<{ name: string; body: string }[]> {
  const found: { name: string; body: string }[] = [];
  for (const name of CONTEXT_FILES) {
    const body = await readIfExists(join(root, name));
    if (body && body.trim()) found.push({ name, body });
  }
  return found;
}

/**
 * Decide whether the project's context may load. Already-decided → recall the
 * decision. Auto-trust lever on → trust + persist without asking. Undecided +
 * confirmer → ask and persist. Undecided + no confirmer → untrusted (fail safe).
 * A project with no context files needs no trust.
 */
export async function resolveProjectTrust(
  root: string,
  confirm?: TrustConfirmer,
  opts: ProjectTrustOpts = {},
): Promise<boolean> {
  if (await hasProjectDecision(root)) return isProjectTrusted(root);
  const files = await collectContextFiles(root);
  if (files.length === 0) return true; // nothing to trust
  if (trustAuto(opts.env ?? process.env, opts.settings)) {
    await trustProject(root, true); // persist so the lever's choice is durable
    return true;
  }
  if (!confirm) return false;
  const name = root.split("/").filter(Boolean).pop() ?? root;
  const trusted = await confirm({ kind: "project", name, files });
  await trustProject(root, trusted);
  return trusted;
}

/**
 * Decide whether an MCP server may mount. Already-decided → recall. Undecided +
 * confirmer → ask (showing its tools) and persist. Undecided + no confirmer →
 * untrusted (fail safe, server skipped).
 */
export async function resolveMcpTrust(
  root: string,
  server: string,
  tools: { name: string; description?: string }[],
  confirm?: TrustConfirmer,
): Promise<boolean> {
  if (await hasMcpDecision(root, server)) return isMcpTrusted(root, server);
  if (!confirm) return false;
  const trusted = await confirm({ kind: "mcp", server, tools });
  await trustMcp(root, server, trusted);
  return trusted;
}
