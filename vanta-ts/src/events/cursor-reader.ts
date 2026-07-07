// HARNESS-EVENTS-WAIT — a generic cursor-based event reader with a blocking
// long-poll, so a consumer (the gateway, an editor adapter, the desktop
// renderer) gets near-real-time delivery without busy-polling a JSONL event
// store. The cursor is a line index (opaque to callers). Pure core + injected
// source/sleep so the long-poll is fully unit-testable with no timers or files.

/** A source of the current event lines (e.g. read events.jsonl → split lines). */
export type EventSource = () => Promise<string[]>;

export type CursorRead = { events: string[]; cursor: number };

/** Cap on a long-poll wait, matching the kernel's ~5min ceiling. */
export const MAX_WAIT_MS = 5 * 60 * 1000;
const DEFAULT_POLL_MS = 500;

/**
 * Read events after `cursor` (a line index). Returns the new lines + the
 * advanced cursor. A cursor past the end (store truncated/rotated) resets to
 * the current end rather than replaying. Pure.
 */
export function readSince(lines: string[], cursor: number): CursorRead {
  const from = cursor < 0 || cursor > lines.length ? lines.length : cursor;
  return { events: lines.slice(from), cursor: lines.length };
}

export type LongPollArgs = {
  source: EventSource;
  cursor: number;
  /** Requested wait; clamped to [0, MAX_WAIT_MS]. */
  timeoutMs: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  pollMs?: number;
  /** Abort the wait early (a closing connection). */
  signal?: { aborted: boolean };
};

/**
 * Block until at least one event exists after `cursor`, or the (capped) timeout
 * elapses — whichever first. Returns immediately when events are already
 * pending. Errors-as-values: a failing source read is treated as "no new events
 * this tick" (never throws across the boundary). Empty `events` = timed out.
 */
export async function longPollEvents(args: LongPollArgs): Promise<CursorRead> {
  const deadline = args.now() + Math.max(0, Math.min(args.timeoutMs, MAX_WAIT_MS));
  const pollMs = args.pollMs ?? DEFAULT_POLL_MS;
  for (;;) {
    const lines = await args.source().catch(() => null);
    if (lines) {
      const read = readSince(lines, args.cursor);
      if (read.events.length > 0) return read;
    }
    if (args.signal?.aborted || args.now() >= deadline) {
      // Return the current cursor position (no events), so the caller can retry
      // from where it left off without missing or replaying anything.
      const latest = (await args.source().catch(() => [])) ?? [];
      return { events: [], cursor: args.cursor < 0 || args.cursor > latest.length ? latest.length : args.cursor };
    }
    await args.sleep(Math.min(pollMs, Math.max(0, deadline - args.now())));
  }
}

/** Live source: read a JSONL event file into non-empty lines (missing → []). */
export function fileEventSource(path: string): EventSource {
  return async () => {
    try {
      const { readFile } = await import("node:fs/promises");
      return (await readFile(path, "utf8")).split("\n").filter((l) => l.trim() !== "");
    } catch {
      return [];
    }
  };
}
