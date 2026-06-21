import { resolve, sep, join } from "node:path";

// PURGE-PLAN — the DRY-RUN plan + typed-confirm gate for `vanta project purge`
// (clearing a project's local `.vanta/` state). This module is PURE and builds
// NOTHING destructive: it enumerates which known state paths EXIST under the
// data dir (via injected stat/exists — never the real fs, never a delete) and
// renders a preview. The typed-confirm token mirrors permissions/bypass-dialog.
//
// CRITICAL INVARIANT (Rule Zero, enforced + tested here):
//   This module NEVER deletes. `buildPurgePlan` only reports; the injected
//   deps do no I/O beyond stat/exists. Every plan entry is CONTAINED inside the
//   data dir (a path that would escape is excluded — never produced). The real
//   deletion is a separate, operator-confirmed boundary that this code must NOT
//   reach: a `vanta project purge` command builds + shows this plan, requires
//   `isPurgeConfirmed(typed)`, and ONLY THEN performs the kernel-gated delete.

/** What a purge would remove: a single contained state path under the data dir. */
export interface PurgeEntry {
  /** Absolute path, guaranteed contained inside the data dir. */
  readonly path: string;
  readonly kind: "file" | "dir";
  /** Size in bytes when the injected `stat` reports it; omitted otherwise. */
  readonly sizeBytes?: number;
}

/** Injected filesystem reads. Read-only by contract — these NEVER delete. */
export interface PurgeDeps {
  /** True when the path exists. */
  readonly exists: (path: string) => boolean;
  /** Size in bytes of the path, or undefined if unknown/unavailable. */
  readonly stat: (path: string) => number | undefined;
}

/**
 * The known `.vanta` local state entries a purge targets, each relative to the
 * project's data dir. Files and dirs the kernel/agent write per project. Only
 * these named paths are ever candidates — purge can never target anything else.
 */
export const PURGE_STATE_PATHS: ReadonlyArray<{
  readonly rel: string;
  readonly kind: "file" | "dir";
}> = [
  { rel: "events.jsonl", kind: "file" },
  { rel: "approvals.tsv", kind: "file" },
  { rel: "goals.tsv", kind: "file" },
  { rel: "goal-deps.json", kind: "file" },
  { rel: "session-memory.md", kind: "file" },
  { rel: "ralph-loop.json", kind: "file" },
  { rel: "handoff.md", kind: "file" },
  { rel: "spawns.jsonl", kind: "file" },
  { rel: "loops", kind: "dir" },
  { rel: "sessions", kind: "dir" },
  { rel: "ccr", kind: "dir" },
  { rel: "sidechains", kind: "dir" },
  { rel: "bg-tasks", kind: "dir" },
  { rel: "bugs", kind: "dir" },
  { rel: "worktrees", kind: "dir" },
  { rel: "fleets", kind: "dir" },
];

/** The exact phrase the operator must type to confirm a purge. A bare "y" is rejected. */
export const PURGE_CONFIRM_TOKEN = "purge project state";

/** True when an absolute path is contained inside `dataDir` (the dir itself is allowed). */
function isContained(abs: string, base: string): boolean {
  return abs === base || abs.startsWith(base + sep);
}

/**
 * Build the DRY-RUN purge plan: the PurgeEntry[] for the known state paths that
 * EXIST under `dataDir`, sized via the injected `stat`. PURE — deletes nothing.
 *
 * Guarantees: every entry's path is CONTAINED inside `dataDir` (a candidate that
 * would resolve outside is excluded, never produced); a missing path is skipped;
 * an empty/clean data dir yields `[]`. The injected `exists`/`stat` do NO writes.
 */
export function buildPurgePlan(dataDir: string, deps: PurgeDeps): PurgeEntry[] {
  const base = resolve(dataDir);
  const plan: PurgeEntry[] = [];
  for (const { rel, kind } of PURGE_STATE_PATHS) {
    const abs = resolve(base, rel);
    if (!isContained(abs, base)) continue; // never escape the data dir
    if (!deps.exists(abs)) continue; // only existing state is a candidate
    const sizeBytes = deps.stat(abs);
    plan.push(
      sizeBytes === undefined ? { path: abs, kind } : { path: abs, kind, sizeBytes },
    );
  }
  return plan;
}

/**
 * True only when the typed input EQUALS `PURGE_CONFIRM_TOKEN` (case-insensitive,
 * trimmed). A bare "y"/"yes", an empty string, or a near-miss → false. PURE.
 * This is the typed-token gate: the operator must type the exact phrase before
 * any deletion is allowed to run.
 */
export function isPurgeConfirmed(typed: string): boolean {
  return typed.trim().toLowerCase() === PURGE_CONFIRM_TOKEN;
}

/** Sum the known sizes of a plan (entries without a size contribute 0). */
function totalBytes(plan: ReadonlyArray<PurgeEntry>): number {
  return plan.reduce((sum, e) => sum + (e.sizeBytes ?? 0), 0);
}

/** Human-readable size: bytes under 1 KB, else KB to one decimal. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Render the DRY-RUN preview for a purge plan. PURE — it describes what WOULD be
 * removed and states plainly that nothing is deleted yet, then tells the operator
 * the exact token to type to confirm. An empty plan reports a clean data dir.
 */
export function formatPurgePlan(plan: ReadonlyArray<PurgeEntry>): string {
  if (plan.length === 0) {
    return [
      "No local project state found — nothing to purge.",
      "(Dry run: nothing is deleted.)",
    ].join("\n");
  }
  const total = formatSize(totalBytes(plan));
  const lines = [
    `Would remove ${plan.length} item${plan.length === 1 ? "" : "s"} (${total}):`,
    "",
  ];
  for (const e of plan) {
    const size = e.sizeBytes === undefined ? "" : ` (${formatSize(e.sizeBytes)})`;
    lines.push(`  ${e.kind === "dir" ? "dir " : "file"}  ${e.path}${size}`);
  }
  lines.push(
    "",
    `Total: ${plan.length} item${plan.length === 1 ? "" : "s"}, ${total}`,
    "",
    "Nothing is deleted yet — this is a dry run.",
    `To proceed, type exactly: ${PURGE_CONFIRM_TOKEN}`,
    'Anything else (including a bare "y"/"yes" or empty input) cancels the purge.',
  );
  return lines.join("\n");
}

/**
 * Where the live `vanta project purge` command WOULD wire this (NOT built here):
 *   1. resolve the project data dir (kernel `.vanta/`, e.g. `join(root, ".vanta")`)
 *   2. `buildPurgePlan(dataDir, { exists: existsSync, stat: realStatBytes })`
 *   3. print `formatPurgePlan(plan)` (dry run — mutates nothing)
 *   4. read the operator's typed line; require `isPurgeConfirmed(typed)` to pass
 *   5. ONLY THEN perform the kernel-gated deletion of `plan` entries.
 * Step 5 — the actual delete — is the named, operator-confirmed boundary that is
 * deliberately NOT implemented in this round.
 */
export function purgeCommandWiringPath(root: string): string {
  return join(root, ".vanta");
}
