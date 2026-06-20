// VANTA-RESOURCE-UPDATE-MSG — pure formatter for the MCP resource-change line.
//
// When a mounted MCP server signals a resource change — the MCP
// `notifications/resources/updated` (carries a `uri`) or
// `notifications/resources/list_changed` notification — the operator should see
// it in the transcript as one compact line so live MCP resource activity is
// visible:
//
//   "⟳ mcp <server>: resource updated — <uri>"
//
// This module owns ONLY the string shape. The server name and resource URI are
// untrusted (an external MCP server set both), so both are stripped of the WHOLE
// control/ANSI sequence before rendering — neither can inject a terminal escape
// into the transcript, and no parameter residue (e.g. "[31m") is left behind.
// The URI is truncated to a sane max with an ellipsis so a long URI stays bounded
// on one line.
//
// WIRING (not done this round, named for the follow-up — mirrors clarity-gate):
//   - Producer: `mcp/events.ts mcpClientEvents(...).onNotification(method, params)`
//     already receives every MCP server notification (it currently forwards them
//     to the `Notification` hook). A resource-change notification arrives there as
//     `method === "notifications/resources/updated"` (params `{ uri }`) or
//     `"notifications/resources/list_changed"` (no uri).
//   - Surface: in that `onNotification` path, gate on
//     `isResourceChange(method)`, build `resourceUpdateLine({ server, method, params })`,
//     and feed the string to the transcript as a `{ kind: "note", text }` entry
//     (`ui/reducer.ts` addNote -> `ui/transcript.tsx` NoteView). No resource
//     notification -> nothing built -> nothing shown (this module renders nothing
//     on its own; `resourceUpdateLine` returns null for a non-resource event).

/** The MCP resource-change attribution glyph — a cycle/refresh arrow. */
export const RESOURCE_GLYPH = "⟳";

/** Max rendered length of the resource URI before truncation (then ellipsis). */
export const RESOURCE_URI_MAX = 200;

const ELLIPSIS = "…";

// Full ANSI escape sequences (CSI / OSC / single-char), 7-bit (ESC-introduced)
// and 8-bit (\x9b CSI / \x9d OSC) — removed ENTIRELY (introducer + parameter +
// final bytes) so the server name and URI can neither inject an escape nor leave
// the visible parameter residue (e.g. "[31m") behind. Mirrors ui/advisor-msg.ts.
const ANSI_SEQUENCE = new RegExp(
  "[\\u001b\\u009b][[\\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PR-Za-z]" +
    "|\\u001b[@-Z\\\\-_]",
  "g",
);
// Any remaining bare control char (NUL, BEL, DEL, the 8-bit CSI/OSC introducers,
// and newlines/tabs) — stripped to a space so a forged newline can't spoof a
// second transcript row. Mirrors term/terminal-title.ts + ui/advisor-msg.ts.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f\\u009b\\u009d]", "g");
const WHITESPACE_RUN = /[ \t]+/g;

export type FormatResourceOptions = {
  /** Override the default URI truncation length. */
  readonly maxLen?: number;
};

/** Strip the WHOLE control/ANSI sequence, collapse horizontal whitespace runs,
 *  trim. Newlines fall inside the control range too, so they collapse to a space
 *  — the line is one logical note, so this keeps it on one row and stops a forged
 *  newline from spoofing a second transcript line. */
function sanitize(raw: string): string {
  return raw
    .replace(ANSI_SEQUENCE, "")
    .replace(CONTROL_CHARS, " ")
    .replace(WHITESPACE_RUN, " ")
    .trim();
}

/** Truncate to at most `max` chars, appending an ellipsis when cut. */
function truncate(text: string, max: number): string {
  if (max <= 0 || text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - ELLIPSIS.length)).trimEnd()}${ELLIPSIS}`;
}

/** Format one MCP resource-change line:
 *  "⟳ mcp <server>: resource updated — <uri>".
 *  Both `server` and `uri` are control/ANSI-stripped (no escape injection); the
 *  URI is truncated to `opts.maxLen ?? RESOURCE_URI_MAX` with an ellipsis. A
 *  blank server falls back to a bare "mcp"; a blank URI renders the head alone
 *  ("⟳ mcp <server>: resource updated") — e.g. a `list_changed` notification with
 *  no specific URI. */
export function formatResourceUpdate(
  server: string,
  uri: string,
  opts: FormatResourceOptions = {},
): string {
  const name = sanitize(server);
  const label = name.length > 0 ? `mcp ${name}` : "mcp";
  const max = opts.maxLen ?? RESOURCE_URI_MAX;
  const target = truncate(sanitize(uri), max);
  const head = `${RESOURCE_GLYPH} ${label}: resource updated`;
  return target.length > 0 ? `${head} — ${target}` : head;
}

/** An MCP resource-change event as it arrives at `mcp/events.ts onNotification`:
 *  the server label plus the raw notification `method`/`params`. All fields are
 *  optional/untrusted (an external server set them). */
export type McpResourceEvent = {
  readonly server?: unknown;
  readonly method?: unknown;
  readonly params?: unknown;
};

/** MCP resource-change notification methods (the `uri`-carrying `updated` and the
 *  whole-list `list_changed`). Compared lower-cased so casing can't slip a match. */
const RESOURCE_METHODS = new Set([
  "notifications/resources/updated",
  "notifications/resources/list_changed",
]);

/** Whether an MCP notification method signals a resource change. Tolerant of a
 *  missing/non-string method (returns false). */
export function isResourceChange(method: unknown): boolean {
  return typeof method === "string" && RESOURCE_METHODS.has(method.toLowerCase());
}

/** Pull a `uri` string out of an MCP notification's `params` (`{ uri }`), or "".
 *  Tolerant of missing params / a non-string uri. */
function uriFromParams(params: unknown): string {
  if (!params || typeof params !== "object") return "";
  const uri = (params as { uri?: unknown }).uri;
  return typeof uri === "string" ? uri : "";
}

/** Coerce an unknown field to a string for rendering ("" for null/undefined). */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Format a transcript line from an MCP resource-change event object, or null if
 *  the event is not a resource change (so a non-resource notification surfaces
 *  nothing). Tolerant of missing fields — a missing `server`/`uri` degrades to
 *  the bare-head/no-uri form rather than throwing. */
export function resourceUpdateLine(
  event: McpResourceEvent,
  opts: FormatResourceOptions = {},
): string | null {
  if (!isResourceChange(event.method)) return null;
  return formatResourceUpdate(asString(event.server), uriFromParams(event.params), opts);
}
