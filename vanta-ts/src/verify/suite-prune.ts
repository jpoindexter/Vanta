import type { Lock } from "./store.js";

// SELFHARNESS-SUITE-PRUNE — a locked regression input goes STALE when the tools
// or schema move under it; a stale suite just gets better at explaining
// yesterday's bug. This detects locks whose assumptions likely no longer hold
// and FLAGS them for refresh/removal (never auto-deletes — Rule Zero; the
// operator decides). Pure: every input (known commands, now, thresholds) is
// injected, so the maintenance pass is deterministic + testable.

export type StaleReason =
  | { kind: "unknown-command"; command: string } // references a `vanta <sub>` that no longer exists (schema/tool drift)
  | { kind: "not-reverified"; days: number } // hasn't been re-run within the window (assumptions unchecked)
  | { kind: "long-regressed"; days: number }; // regressed and left unrepaired (noise, not signal)

export type StaleLock = { id: string; claim: string; reasons: StaleReason[] };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pull the `vanta <subcommand>` referenced by a lock's check command, or null.
 * Only vanta-subcommand drift is deterministically knowable from the command
 * text (arbitrary shell binaries aren't); that's the schema surface that moves.
 */
export function vantaSubcommand(command: string): string | null {
  const m = /(?:^|[;&|]\s*|\b)(?:\.?\/?(?:run\.sh|vanta)|npm run vanta(?:\s+--)?)\s+([a-z][a-z0-9-]*)/i.exec(command);
  return m ? m[1]!.toLowerCase() : null;
}

export type PruneOpts = {
  /** The `vanta` subcommands that currently exist (drift check). */
  knownCommands: ReadonlySet<string>;
  now: number;
  /** A lock not updated within this many days is flagged not-reverified (default 30). */
  maxAgeDays?: number;
  /** A lock regressed for longer than this many days is flagged long-regressed (default 14). */
  maxRegressedDays?: number;
};

/** Reasons a single lock is stale (empty = healthy). Pure. */
export function staleReasons(lock: Lock, opts: PruneOpts): StaleReason[] {
  const reasons: StaleReason[] = [];
  const sub = vantaSubcommand(lock.command);
  if (sub && !opts.knownCommands.has(sub)) reasons.push({ kind: "unknown-command", command: `vanta ${sub}` });

  const ageDays = Math.floor((opts.now - lock.updated) / DAY_MS);
  if (ageDays > (opts.maxAgeDays ?? 30)) reasons.push({ kind: "not-reverified", days: ageDays });

  if (lock.status === "regressed" && ageDays > (opts.maxRegressedDays ?? 14)) {
    reasons.push({ kind: "long-regressed", days: ageDays });
  }
  return reasons;
}

/** Detect every stale lock in the suite, flagged with its reasons. Pure. */
export function detectStaleLocks(locks: readonly Lock[], opts: PruneOpts): StaleLock[] {
  const out: StaleLock[] = [];
  for (const lock of locks) {
    const reasons = staleReasons(lock, opts);
    if (reasons.length) out.push({ id: lock.id, claim: lock.claim, reasons });
  }
  return out;
}

function describeReason(r: StaleReason): string {
  if (r.kind === "unknown-command") return `references removed command "${r.command}"`;
  if (r.kind === "not-reverified") return `not re-verified in ${r.days}d`;
  return `regressed + unrepaired for ${r.days}d`;
}

/** Human maintenance report — flags for refresh/removal, never a deletion. Pure. */
export function formatStaleReport(stale: readonly StaleLock[], total: number): string {
  if (!stale.length) return `verify suite: ${total} lock(s), all honest (no stale assumptions).`;
  const lines = stale.map((s) => `  ⚠ ${s.id}: ${s.reasons.map(describeReason).join("; ")} — ${s.claim.slice(0, 60)}`);
  return [`verify suite: ${stale.length}/${total} lock(s) flagged stale — refresh or remove:`, ...lines].join("\n");
}
