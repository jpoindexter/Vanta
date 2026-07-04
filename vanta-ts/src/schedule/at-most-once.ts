/**
 * At-most-once cron dedup — pure decision layer.
 *
 * A due cron task must fire AT MOST ONCE per due window even if the runner
 * ticks multiple times within the same minute or two ticks overlap. The window
 * is minute-resolution (cron's smallest field), so each `(taskId, windowKey)`
 * pair fires once. A genuinely-new window (the next minute) is a new key and
 * fires again.
 *
 * Everything here is pure: no I/O, no clock reads. The runner persists the
 * returned map; these functions only decide.
 */

/** Maps a task id → the last window key it fired for. */
export type LastFired = Record<string, string>;

/** Pad a number to 2 digits (e.g. 8 → "08"). */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The minute-resolution window key for a moment, in LOCAL time to match
 * `isDue` (which reads the Date's local minute/hour). Format
 * `YYYY-MM-DDTHH:MM` — stable, lexicographically sortable, and identical for
 * any two ticks within the same minute.
 */
export function fireWindowKey(now: Date): string {
  const y = now.getFullYear();
  const mo = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const h = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  return `${y}-${mo}-${d}T${h}:${mi}`;
}

/**
 * Whether a task should fire for `windowKey`. True unless this exact
 * `(taskId, windowKey)` already fired — i.e. a re-tick within the same minute
 * is skipped, but the next minute (a new key) fires.
 */
export function shouldFire(
  taskId: string | number,
  windowKey: string,
  lastFired: LastFired,
): boolean {
  return lastFired[String(taskId)] !== windowKey;
}

/**
 * Record that `taskId` fired for `windowKey`. Non-mutating: returns a NEW map,
 * leaving `lastFired` untouched so the caller controls when to persist.
 */
export function markFired(
  lastFired: LastFired,
  taskId: string | number,
  windowKey: string,
): LastFired {
  return { ...lastFired, [String(taskId)]: windowKey };
}

/** Desired-vs-armed split for one fire window (see `reconcileWindow`). */
export type Reconciliation = {
  /** Ids already fired for `windowKey` (armed) — must NOT re-fire. */
  armed: string[];
  /** Ids due this window but not yet fired (desired) — the ones to arm/fire. */
  pending: string[];
};

/**
 * Reconcile desired-vs-armed for a fire window. Given the ids due at `windowKey`
 * and the persisted dedup map, split them into already-fired (`armed`) and
 * still-to-fire (`pending`). This is the boot-time reconcile: after a restart
 * the runner re-derives which due tasks were already claimed for the current
 * window (so it doesn't re-fire them) vs which still need firing — without a
 * separate "armed" ledger, since `lastFired` already IS the durable arm record.
 * Pure: no I/O, order-preserving.
 */
export function reconcileWindow(
  dueIds: ReadonlyArray<string | number>,
  windowKey: string,
  lastFired: LastFired,
): Reconciliation {
  const armed: string[] = [];
  const pending: string[] = [];
  for (const raw of dueIds) {
    const id = String(raw);
    (lastFired[id] === windowKey ? armed : pending).push(id);
  }
  return { armed, pending };
}
