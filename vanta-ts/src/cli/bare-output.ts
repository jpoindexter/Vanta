// VANTA-BARE-MODE — pure bare-output model for `vanta run --bare` (and VANTA_BARE=1):
// strip ALL decoration from the output stream so Vanta composes in a shell
// pipeline — just the essential text/result lines, no glyphs / ANSI / banners /
// cost-footers / spinners. Default (no flag) = the current rich output, unchanged.
//
// SECURITY: bare output is machine-consumed (piped downstream). A tool result is
// untrusted text that can carry terminal escape sequences; we strip ALL ANSI +
// control chars (reusing the term/bash-io strip) so a result can't inject escape
// codes into a downstream pipe. Pure — no side effects, fully unit-tested.

import { stripKeepNewlines } from "../term/bash-io.js";

/** Content kinds that produce a plain line; decoration kinds are suppressed. */
export type BareEvent =
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string }
  | { kind: "result"; text: string }
  | { kind: "decoration" };

/** A tool call renders as one minimal, parse-stable marker line in bare mode. */
const TOOL_PREFIX = "[tool]";

/**
 * True when bare mode is requested: `--bare` present in argv OR VANTA_BARE=1
 * (any truthy "1"/"true"). Neither → false (default = rich output).
 */
export function bareEnabled(argv: readonly string[], env: NodeJS.ProcessEnv): boolean {
  if (argv.includes("--bare")) return true;
  const flag = env.VANTA_BARE;
  return flag === "1" || flag === "true";
}

/**
 * The plain line for one output event. Content events (text/result) → their
 * ANSI/control-stripped, trimmed text plus a trailing newline (empty after
 * stripping → "" so it's dropped). A tool event → a minimal "[tool] name" line.
 * A decoration event (banner/cost/spinner) → "" (suppressed). Pure.
 */
export function formatBareEvent(event: BareEvent): string {
  switch (event.kind) {
    case "text":
    case "result": {
      const line = stripKeepNewlines(event.text).trim();
      return line ? `${line}\n` : "";
    }
    case "tool": {
      const name = stripKeepNewlines(event.name).trim();
      return name ? `${TOOL_PREFIX} ${name}\n` : "";
    }
    case "decoration":
      return "";
  }
}

/**
 * The full bare output for a sequence of events: each formatted, suppressed
 * (empty) lines dropped, joined into one stream. Empty input → "". Pure.
 */
export function bareLines(events: readonly BareEvent[]): string {
  return events.map(formatBareEvent).filter((line) => line !== "").join("");
}
