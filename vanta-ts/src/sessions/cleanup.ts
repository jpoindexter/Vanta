import type { SessionMeta } from "./store.js";

// VANTA-SESSION-CLEANUP — prune stored sessions older than `cleanupPeriodDays`.
// Default is unset → no cleanup, so current behavior is unchanged. The selection
// (which sessions are stale) is a pure fn with an injected `now`; pruning injects
// its fs effects so the orchestration is fully testable. Errors are values: a
// single failed delete is counted as skipped, never thrown across the boundary.

const MS_PER_DAY = 86_400_000;

/**
 * The session ids whose last-updated timestamp is older than `periodDays` before
 * `now`. Pure. An unset/<=0 period (or a session whose `updated` doesn't parse)
 * is never selected, so the caller deletes nothing by default.
 */
export function staleSessions(
  sessions: SessionMeta[],
  periodDays: number | undefined,
  now: Date,
): string[] {
  if (periodDays === undefined || periodDays <= 0) return [];
  const cutoff = now.getTime() - periodDays * MS_PER_DAY;
  const stale: string[] = [];
  for (const s of sessions) {
    const updated = Date.parse(s.updated);
    if (Number.isNaN(updated)) continue; // unparseable timestamp → keep, never prune
    if (updated < cutoff) stale.push(s.id);
  }
  return stale;
}

/** Injected effects for {@link pruneSessions} — all side effects are deps. */
export interface PruneDeps {
  listSessions: () => Promise<SessionMeta[]>;
  deleteSession: (id: string) => Promise<void>;
  periodDays: number | undefined;
  now: Date;
}

export interface PruneResult {
  /** Number of stale sessions successfully deleted. */
  deleted: number;
  /** Stale-but-failed deletions (errors-as-values; pruning never throws). */
  failed: number;
}

/**
 * Delete every stale session and report counts. A no-op (deleted=0, failed=0)
 * when `periodDays` is unset/<=0 — the default — so existing installs keep all
 * sessions until cleanup is explicitly configured.
 */
export async function pruneSessions(deps: PruneDeps): Promise<PruneResult> {
  if (deps.periodDays === undefined || deps.periodDays <= 0) {
    return { deleted: 0, failed: 0 };
  }
  const sessions = await deps.listSessions();
  const ids = staleSessions(sessions, deps.periodDays, deps.now);
  let deleted = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await deps.deleteSession(id);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { deleted, failed };
}
