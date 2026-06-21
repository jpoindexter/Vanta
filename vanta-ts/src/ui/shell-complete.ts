// VANTA-BASH-SHELL-COMPLETION — shell-aware tab completion for shell input in the
// composer (or a `!`-bash line). Sibling to ui/path-complete.ts (file-path
// completion) and term/at-context.ts (@-file palette): same pure-classifier +
// inject-the-source shape, but here the cursor position decides WHICH kind of
// completion the operator wants — a COMMAND name (first word), a VARIABLE (a `$FOO`
// token), or a FILE PATH (a later word) — so a shell line completes like a real shell.
//
// Wiring (NOT done this round, mirrors clarity-gate / path-complete's header): the
// composer's Tab handler (ui/composer.tsx) — when the buffer is a shell command (a
// `!`-prefixed line, or shell-cmd mode) — would call
//   shellComplete(buffer, cursor, {
//     commands: scanPathExecutables(),   // PATH executables, scanned ONCE and cached
//     envNames: Object.keys(process.env),// live env names
//     files: listCwdEntries(cwd),        // cwd entries (reuse path-complete's listDir)
//   })
// and apply the returned completions to the buffer (single match → fill; many → show).
// The live PATH scan (read each $PATH dir once, collect executable basenames) and the
// fs read are the injected BOUNDARY — exactly as path-complete injects `listDir` and
// file-index injects `walk`. This module stays pure so the routing is unit-tested
// without touching the real PATH or filesystem.
//
// SECURITY: completions are SUGGESTIONS ONLY. Completing a command/var/file name does
// NOT run, read, or trust it — when the operator actually executes the shell line it
// still flows through the kernel `assess()` gate (shell_cmd's describeForSafety). This
// module never executes, never reads file contents, and never expands a glob; matching
// is a literal prefix over the injected source.

/** Default cap on returned completions — a suggestion list stays readable. */
export const DEFAULT_SHELL_MAX = 20;

/** Which kind of completion the cursor position is asking for. */
export type ShellCompletionKind = "command" | "variable" | "file";

/** The classified completion context at the cursor. */
export interface ShellContext {
  /** command (first word) · variable (`$FOO` token) · file (a later word). */
  readonly kind: ShellCompletionKind;
  /** The partial being completed (for a variable: the name AFTER the `$`). */
  readonly fragment: string;
}

/** Injected completion sources — the live PATH / env / cwd are the caller's boundary. */
export interface ShellCompleteSources {
  /** Executable basenames from PATH (already deduped is fine; we dedupe anyway). */
  readonly commands: readonly string[];
  /** Environment variable NAMES (no `$`, no values). */
  readonly envNames: readonly string[];
  /** cwd entry paths/names (directories may carry a trailing `/`, like listDir). */
  readonly files: readonly string[];
}

/**
 * Classify what the cursor wants completed in a shell line (PURE).
 * - A single leading `!` (the bash-escape prefix) is stripped before classifying,
 *   and the cursor is shifted to match, so `!ec|` classifies exactly like `ec|`.
 * - The token under the cursor is the run of non-whitespace ending AT the cursor.
 * - A token starting with `$` → VARIABLE; the fragment is the name after the `$`.
 * - Otherwise the FIRST token on the line → COMMAND; any later token → FILE.
 * The fragment is always the text from the token start up to the cursor (so a
 * mid-token cursor completes only what precedes it), never anything after it.
 */
export function classifyShellContext(input: string, cursor: number): ShellContext {
  const { text, pos } = stripBang(input, clampCursor(input, cursor));
  const start = tokenStart(text, pos);
  const token = text.slice(start, pos);

  if (token.startsWith("$")) {
    return { kind: "variable", fragment: token.slice(1) };
  }
  // First token on the line is the command; anything after a space is a file arg.
  const isFirstToken = text.slice(0, start).trim() === "";
  return { kind: isFirstToken ? "command" : "file", fragment: token };
}

/** Match executable names against a prefix: deduped, sorted, capped (PURE). */
export function completeCommand(
  fragment: string,
  commands: readonly string[],
  max: number = DEFAULT_SHELL_MAX,
): string[] {
  const seen = new Set<string>();
  for (const name of commands) {
    if (name.startsWith(fragment)) seen.add(name);
  }
  return [...seen].sort().slice(0, max);
}

/** Match env var names against a prefix, returning each with a `$` prefix (PURE). */
export function completeVariable(
  fragment: string,
  envNames: readonly string[],
  max: number = DEFAULT_SHELL_MAX,
): string[] {
  const seen = new Set<string>();
  for (const name of envNames) {
    if (name.startsWith(fragment)) seen.add(`$${name}`);
  }
  return [...seen].sort().slice(0, max);
}

/** Match cwd paths against a prefix (reuse path-complete style): deduped, sorted, capped. */
export function completeFile(
  fragment: string,
  files: readonly string[],
  max: number = DEFAULT_SHELL_MAX,
): string[] {
  const seen = new Set<string>();
  for (const path of files) {
    if (path.startsWith(fragment)) seen.add(path);
  }
  return [...seen].sort().slice(0, max);
}

/**
 * Complete a shell line at the cursor, routing to the right completer by context
 * (PURE). The live PATH / env / cwd lists arrive injected via `sources`. No match
 * (or an empty source) → `[]` — there is no "fill the buffer with nothing" case.
 */
export function shellComplete(
  input: string,
  cursor: number,
  sources: ShellCompleteSources,
  max: number = DEFAULT_SHELL_MAX,
): string[] {
  const { kind, fragment } = classifyShellContext(input, cursor);
  switch (kind) {
    case "command":
      return completeCommand(fragment, sources.commands, max);
    case "variable":
      return completeVariable(fragment, sources.envNames, max);
    case "file":
      return completeFile(fragment, sources.files, max);
  }
}

/** Clamp a cursor index into `[0, input.length]` so callers can't over/underflow. */
function clampCursor(input: string, cursor: number): number {
  if (cursor < 0) return 0;
  if (cursor > input.length) return input.length;
  return cursor;
}

/**
 * Strip a single leading `!` bash-escape (with any spaces after it) and shift the
 * cursor to match. `!ls` and `! ls` both become `ls`; a `$` or non-bang line is
 * returned unchanged. The cursor never goes below 0 after the shift.
 */
function stripBang(input: string, cursor: number): { text: string; pos: number } {
  if (input[0] !== "!") return { text: input, pos: cursor };
  const after = input.slice(1);
  const trimmed = after.replace(/^\s*/, "");
  const removed = input.length - trimmed.length; // the `!` plus any leading spaces
  return { text: trimmed, pos: Math.max(0, cursor - removed) };
}

/** The index where the token ending at `pos` begins (the last whitespace before it +1). */
function tokenStart(text: string, pos: number): number {
  let start = pos;
  while (start > 0 && !isSpace(text[start - 1]!)) start--;
  return start;
}

/** Shell word separators for token splitting (space + tab). */
function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t";
}
