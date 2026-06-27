import { processCapture } from "../term/terminal-capture.js";
import type { SessionBackend } from "./agent-session.js";

// VANTA-AGENT-SESSION-INTERACTIVE — pane reply-waiting: poll an interactive
// agent's terminal pane until its output settles (or a cap elapses), streaming a
// chrome-filtered progress tail meanwhile. The session lifecycle + registry live
// in ./agent-session.js; this is the read-the-reply half.

export const DEFAULT_MAX_LINES = 120;
const DEFAULT_SETTLE_MS = 2500;
// Cap an interactive send at 40s: a quick reply settles well within this; a LONG task
// (e.g. "build a landing page") never settles, so we return a "still working" status with
// the window to watch instead of blocking Vanta silently (was 120s — felt like a hang).
const DEFAULT_MAX_MS = 40_000;
const POLL_MS = 750;
const PROGRESS_MS = 3000; // emit a progress heartbeat at most this often while waiting

// TUI chrome to skip when summarizing progress: box-drawing dividers, the ❯ input line,
// and the agent's footer/hint lines — so the snapshot shows the agent's ACTUAL activity.
const CHROME = /^[\s─│╭╮╰╯┌┐└┘▔▁]*$|^❯|⏵⏵|shift\+tab|for agents|^\s*tmux |PgUp|focus-events|set -g/i;

/** The last couple of MEANINGFUL pane lines (chrome filtered) — a "what's happening" signal. */
export function tailOf(pane: string): string {
  const lines = pane.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() && !CHROME.test(l));
  return lines.slice(-2).join(" / ").slice(0, 120) || "working…";
}

/** Poll the pane until output settles (unchanged for `settleMs`) or `maxMs` elapses.
 * Streams a progress heartbeat via `onProgress` as the pane changes (so a long task isn't
 * a silent block). `settled` is false when it timed out still changing — i.e. still working. */
export async function waitForReply(o: {
  backend: SessionBackend;
  name: string;
  settleMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (snapshot: string) => void;
}): Promise<{ text: string; settled: boolean }> {
  const settleMs = o.settleMs ?? DEFAULT_SETTLE_MS;
  const maxMs = o.maxMs ?? DEFAULT_MAX_MS;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let last = "";
  let stableFor = 0;
  let elapsed = 0;
  let lastEmit = 0;
  while (elapsed < maxMs) {
    await sleep(POLL_MS);
    elapsed += POLL_MS;
    const cur = o.backend.capture(o.name);
    if (cur === last) {
      stableFor += POLL_MS;
      if (stableFor >= settleMs) return { text: processCapture(last, { maxLines: DEFAULT_MAX_LINES }), settled: true };
    } else {
      last = cur;
      stableFor = 0;
      if (o.onProgress && elapsed - lastEmit >= PROGRESS_MS) { lastEmit = elapsed; o.onProgress(tailOf(cur)); }
    }
  }
  return { text: processCapture(last, { maxLines: DEFAULT_MAX_LINES }), settled: false };
}
