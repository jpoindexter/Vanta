/**
 * VANTA-SHELL-SNAPSHOT — capture a read-only snapshot of the user's interactive
 * shell environment (aliases, function names, PATH) for shell-completion /
 * context support.
 *
 * The parsers + the snapshot assembly are PURE and unit-tested; the only impure
 * seam is the injected `runShell` runner in {@link captureShellSnapshot}, so
 * tests never touch a real shell. SECURITY: this is read-only capture — captured
 * aliases/functions are stored as strings and NEVER executed by Vanta.
 */

/** A captured interactive-shell environment. All fields are inert data. */
export type ShellSnapshot = {
  /** alias name → its expansion (e.g. `ll` → `ls -la`). */
  aliases: Record<string, string>;
  /** declared function names (bodies are intentionally dropped — names only). */
  functions: string[];
  /** ordered, de-empties PATH entries. */
  path: string[];
};

/** Result of a live capture: the snapshot, or a clean error value (no throw). */
export type CaptureResult =
  | { ok: true; snapshot: ShellSnapshot }
  | { ok: false; error: string };

/** Injected shell runner — runs a command string in the user's shell and
 *  returns its combined stdout. The live boundary; in tests this returns a
 *  fixture so no real shell is spawned. Errors-as-values: a failed run rejects. */
export type RunShell = (command: string) => Promise<string>;

/** Dependencies for {@link captureShellSnapshot}. */
export type CaptureDeps = {
  runShell: RunShell;
  /** the user's login shell, to tailor the snapshot command (default "bash"). */
  shell?: string;
};

/** Section markers fencing each block of the snapshot command's output, so one
 *  `runShell` round-trip yields all three sections in a single parseable dump. */
const ALIAS_MARKER = "###VANTA_ALIASES###";
const FUNCTIONS_MARKER = "###VANTA_FUNCTIONS###";
const PATH_MARKER = "###VANTA_PATH###";

/** Shells whose function lister is `functions` (zsh/fish) rather than `declare -f` (bash). */
const FUNCTIONS_LISTER_SHELLS = new Set(["zsh", "fish"]);

/**
 * Parse `alias` output into a name→value map. Tolerant of both quoted
 * (`alias ll='ls -la'`) and unquoted (`alias ll=ls`) forms, an optional
 * leading `alias ` keyword (bash prints it, zsh does not), and surrounding
 * single/double quotes on the value. Lines without an `=` are skipped.
 */
export function parseAliases(aliasOutput: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of aliasOutput.split("\n")) {
    const line = raw.replace(/^alias\s+/, "").trim();
    if (!line) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const name = line.slice(0, eq).trim();
    if (!name) continue;
    out[name] = stripQuotes(line.slice(eq + 1).trim());
  }
  return out;
}

/** Strip a single matching pair of surrounding single or double quotes. */
function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    if ((first === "'" || first === '"') && value[value.length - 1] === first) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Extract function NAMES from a function listing. Handles both forms:
 *   - `declare -f name` (bash, names-only) / `declare -f name ()`
 *   - `name () {` (bash `declare -f` full bodies, zsh `functions`)
 * Body lines are ignored; duplicates are de-duped, first-seen order kept.
 */
export function parseFunctions(declareOutput: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of declareOutput.split("\n")) {
    const name = functionNameFromLine(raw);
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

/** Pull a function name from one listing line, or "" if the line declares none. */
function functionNameFromLine(raw: string): string {
  const line = raw.trim();
  const declared = line.match(/^declare\s+-f\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (declared?.[1]) return declared[1];
  // `name ()` / `name () {` / `function name {` — a definition header, not a body line.
  const header = line.match(/^(?:function\s+)?([A-Za-z_][A-Za-z0-9_-]*)\s*\(\s*\)/);
  if (header?.[1]) return header[1];
  return "";
}

/** Split a `$PATH` value on `:`, dropping empty segments (leading/trailing/`::`). */
export function parsePath(pathValue: string): string[] {
  return pathValue.split(":").map((s) => s.trim()).filter(Boolean);
}

/**
 * Build the command to run in the user's shell. Emits each section behind its
 * marker so {@link parseShellSnapshot} can split one combined dump. zsh/fish use
 * `functions` to list function names; everything else uses `declare -f`.
 */
export function buildSnapshotCommand(shell: string): string {
  const fnLister = FUNCTIONS_LISTER_SHELLS.has(baseShell(shell)) ? "functions" : "declare -f";
  return [
    `echo '${ALIAS_MARKER}'`,
    "alias",
    `echo '${FUNCTIONS_MARKER}'`,
    fnLister,
    `echo '${PATH_MARKER}'`,
    'echo "$PATH"',
  ].join("; ");
}

/** Reduce a shell path/name to its base name (`/bin/zsh` → `zsh`). */
function baseShell(shell: string): string {
  return (shell.split("/").pop() ?? shell).trim();
}

/**
 * Split a combined snapshot dump on the section markers and run each section
 * through its parser. A missing marker yields an empty section (tolerant), so a
 * shell that prints no aliases/functions still produces a valid snapshot.
 */
export function parseShellSnapshot(rawOutput: string): ShellSnapshot {
  const aliasBlock = sectionBetween(rawOutput, ALIAS_MARKER, FUNCTIONS_MARKER);
  const fnBlock = sectionBetween(rawOutput, FUNCTIONS_MARKER, PATH_MARKER);
  const pathBlock = sectionBetween(rawOutput, PATH_MARKER, null);
  return {
    aliases: parseAliases(aliasBlock),
    functions: parseFunctions(fnBlock),
    path: parsePath(pathBlock.trim()),
  };
}

/** The text between `start` marker and the next marker (`end`, or end-of-string). */
function sectionBetween(text: string, start: string, end: string | null): string {
  const from = text.indexOf(start);
  if (from === -1) return "";
  const after = from + start.length;
  const to = end ? text.indexOf(end, after) : -1;
  return text.slice(after, to === -1 ? undefined : to);
}

/**
 * Capture a live shell snapshot via the injected `runShell`. The ONLY impure
 * step; everything around it is pure. A runner failure returns a clean error
 * value (errors-as-values, never throws across the boundary).
 */
export async function captureShellSnapshot(deps: CaptureDeps): Promise<CaptureResult> {
  const shell = deps.shell ?? "bash";
  const command = buildSnapshotCommand(shell);
  try {
    const raw = await deps.runShell(command);
    return { ok: true, snapshot: parseShellSnapshot(raw) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `shell snapshot failed: ${detail}` };
  }
}
