import { providerById } from "../providers/catalog.js";
import { isRuntimeAdapter, runtimeIdFromAdapter } from "../worker-runtimes/adapter-id.js";
import type { Worker } from "./store.js";

// PCLIP-AGENT-HIRE — pure roster helpers for hiring a budgeted, role-tagged
// agent. `hireAgent` adds a new worker to the roster (the same roster the team
// tool dispatches tasks to), validating the adapter against the provider
// catalog and the budget before it ever touches disk. Errors-as-values.

export type HireSpec = {
  role: string;
  /**
   * A known PROVIDER_CATALOG id (the Vanta loop on that model backend), or
   * "cli:<runtime id>" to hire an external CLI worker such as "cli:claude-code".
   * An unavailable CLI is reported when a ticket is dispatched, not at hire time.
   */
  adapter: string;
  /** Optional spend budget in USD; must be a positive number when given. */
  budgetUsd?: number;
  /** Optional display title/tag; defaults to the role. */
  title?: string;
};

export type HireResult =
  | { ok: true; roster: Worker[]; agent: Worker }
  | { ok: false; error: string };

/** Lowercase kebab slug of a role, e.g. "Web Scraper" → "web-scraper". */
export function slugifyRole(role: string): string {
  return role
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Derive a stable, unique worker id from a role slug, appending a counter when
 * the base slug (or a numbered variant) is already taken. Pure.
 */
export function deriveAgentId(roster: Worker[], role: string): string {
  const base = slugifyRole(role) || "agent";
  const taken = new Set(roster.map((w) => w.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function checkAdapter(adapter: string): string | null {
  if (isRuntimeAdapter(adapter)) {
    return runtimeIdFromAdapter(adapter) ? null : `invalid worker runtime "${adapter}" — use cli:<id> with lowercase letters, digits and dashes (for example cli:claude-code)`;
  }
  return providerById(adapter) ? null : `unknown adapter "${adapter}" — not a known provider id`;
}

/**
 * Hire a budgeted, role-tagged agent into the roster. Returns the new roster
 * plus the created worker, or an error string. Pure — the caller persists.
 */
export function hireAgent(roster: Worker[], spec: HireSpec): HireResult {
  const role = spec.role.trim();
  if (!role) return { ok: false, error: "role is required" };

  const adapter = spec.adapter.trim();
  const adapterError = checkAdapter(adapter);
  if (adapterError) return { ok: false, error: adapterError };

  if (spec.budgetUsd !== undefined && !(Number.isFinite(spec.budgetUsd) && spec.budgetUsd > 0)) {
    return { ok: false, error: `budget must be a positive number, got ${spec.budgetUsd}` };
  }

  const id = deriveAgentId(roster, role);
  if (roster.some((w) => w.id === id)) {
    return { ok: false, error: `worker id "${id}" already exists` };
  }

  const agent: Worker = {
    kind: "worker",
    id,
    role,
    // An external CLI keeps its own default model; none is recorded unless set later.
    ...(isRuntimeAdapter(adapter) ? {} : { model: providerById(adapter)!.defaultModel }),
    status: "idle",
    ts: new Date().toISOString(),
    adapter,
    title: spec.title?.trim() || role,
    ...(spec.budgetUsd !== undefined ? { budgetUsd: spec.budgetUsd } : {}),
  };

  return { ok: true, roster: [...roster, agent], agent };
}
