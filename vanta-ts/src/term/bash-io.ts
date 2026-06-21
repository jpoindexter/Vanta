// VANTA-BASH-IO-MSGS — pure classify + format for rendering a shell tool call as
// TWO distinct transcript messages: the command (input, "$ <cmd>") visually
// separate from its output block, instead of one merged blob. Non-bash tools
// return null here and render as today.
//
// SECURITY: both the command and the output are untrusted text that can carry
// terminal escape sequences. We strip ANSI/control escapes (so neither can inject
// terminal control codes) while PRESERVING newlines in output so multi-line
// results stay readable. Pure — no side effects, fully unit-tested.

/** Bash-family tools whose call renders as a distinct input + output pair. */
const BASH_TOOLS = new Set(["shell_cmd", "run_code"]);

/** Max chars for the one-line input ("$ <cmd>") before truncation. */
const INPUT_MAX = 240;
/** Max lines retained in the output block. */
const OUTPUT_MAX_LINES = 40;
/** Max chars retained in the output block (hard bound, applied after lines). */
const OUTPUT_MAX_CHARS = 4000;

const ELLIPSIS = "…";

// ANSI escape sequences: ESC (\x1b) then CSI (`[ ... final`), OSC (`] ... BEL|ST`),
// or a single-char escape. Matches the whole sequence so it is removed cleanly.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)?|[@-Z\\-_])/g;
// C0 control chars (\x00-\x08, \x0b-\x0c, \x0e-\x1f) + DEL (\x7f) + C1 (\x80-\x9f),
// EXCLUDING \t (\x09), \n (\x0a), \r (\x0d). Tabs/newlines are legible whitespace
// we keep; \r is normalized to \n by callers before this strips the rest.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;

/** Strip ANSI escapes + all control chars, collapsing to a single safe line. */
function stripToLine(text: string): string {
  return text.replace(ANSI_RE, "").replace(/[\r\n\t]+/g, " ").replace(CONTROL_RE, "").trim();
}

/** Strip ANSI escapes + control chars but KEEP newlines (\r\n / \r -> \n). */
export function stripKeepNewlines(text: string): string {
  return text.replace(ANSI_RE, "").replace(/\r\n?/g, "\n").replace(CONTROL_RE, "");
}

/** Truncate a single-line string to `max` chars, marking the cut with an ellipsis. */
function clipChars(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}${ELLIPSIS}` : text;
}

/** True for the shell-family tools (shell_cmd / run_code); false otherwise. */
export function isBashTool(toolName: string): boolean {
  return BASH_TOOLS.has(toolName);
}

/**
 * The input message for a bash tool call: the command as a single, control-safe
 * `$ <cmd>` line, truncated when very long. Empty command -> `$` alone.
 */
export function formatBashInput(command: string): string {
  const safe = clipChars(stripToLine(command), INPUT_MAX);
  return safe ? `$ ${safe}` : "$";
}

/**
 * The output message for a bash tool call: a control-safe block with newlines
 * PRESERVED (multi-line output stays readable), bounded by line count and total
 * chars. Empty/whitespace-only output -> "".
 */
export function formatBashOutput(output: string): string {
  const cleaned = stripKeepNewlines(output).replace(/[ \t]+$/gm, "").trimEnd();
  if (!cleaned) return "";
  const lines = cleaned.split("\n");
  const kept = lines.length > OUTPUT_MAX_LINES
    ? [...lines.slice(0, OUTPUT_MAX_LINES), `${ELLIPSIS} ${lines.length - OUTPUT_MAX_LINES} more lines`]
    : lines;
  const joined = kept.join("\n");
  return joined.length > OUTPUT_MAX_CHARS ? `${joined.slice(0, OUTPUT_MAX_CHARS - 1)}${ELLIPSIS}` : joined;
}

/** Distinct input + output messages for a bash tool call. */
export type BashIoMessages = { input: string; output: string };

/**
 * Classify one tool call into a distinct input message (the command) and output
 * message (its result). Returns null for a non-bash tool — that call renders as
 * today (single `dot Verb(detail) / corner result` row). Pure.
 */
export function bashIoMessages(toolName: string, command: string, output: string): BashIoMessages | null {
  if (!isBashTool(toolName)) return null;
  return { input: formatBashInput(command), output: formatBashOutput(output) };
}
