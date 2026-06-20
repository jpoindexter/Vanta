// VANTA-EXAMPLE-COMMANDS — on an empty prompt / first run, suggest a few
// CONCRETE starter prompts derived from the project's recent git activity
// (recently-changed files → "Review the changes in <file>" / "Write tests for
// <file>"; recent commit subjects → "Continue: <subject>"), always salted with
// 1-2 evergreen safe suggestions. No git / no signals → a small generic set.
//
// Mirrors the project-onboarding / clarity-gate shape: a PURE builder + a PURE
// renderer the host wires onto the empty-input / first-run surface, decoupled
// from any I/O. `gatherGitSignals(deps)` is the one I/O seam, and even it injects
// its git runner so the parse logic is unit-testable against fixtures and a
// runner failure degrades to empty signals (never throws).

/** Git-derived signals the suggestion builder reads. Both lists may be empty. */
export type GitSignals = {
  /** Files changed across the last few commits (most-recent first), de-noised. */
  recentFiles: string[];
  /** Recent commit subject lines (most-recent first). */
  recentSubjects: string[];
};

/** A git runner: run `git <args>` in the repo, resolve stdout. May reject. */
export type GitRunner = (args: string[]) => Promise<string>;

/** Injected dependencies for `gatherGitSignals` — the git runner + repo root. */
export type GatherDeps = {
  run: GitRunner;
  /** Repo root the git commands run against (passed via `git -C <root>`). */
  root: string;
};

/** Default cap on how many suggestions to surface. */
export const MAX_EXAMPLES = 4;

// How far back to read git history for the signals.
const DIFF_RANGE = "HEAD~3";
const LOG_COUNT = "5";

// Evergreen, always-safe starter prompts — independent of any git signal, so an
// empty repo still gets something concrete to try. The fallback list is these.
const EVERGREEN = [
  "Summarize the last 5 commits",
  "Show me the project structure and what it does",
] as const;

// C0 controls (\x00-\x1f incl. ESC \x1b, \t, \n, \r), DEL (\x7f), and C1 controls
// (\x80-\x9f). Stripping these stops a hostile file name / commit subject from
// injecting ANSI escapes or newlines into a rendered suggestion line.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f-\x9f]/g;

/**
 * Strip control + escape characters from a git-derived token (replacing them
 * with a space), then collapse runs of whitespace and trim. Pure. Guarantees the
 * returned string contains no control chars, so it's safe to render inline.
 */
export function sanitizeSignal(raw: string): string {
  return raw.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
}

/** Cap a sanitized token for one-line display without re-introducing controls. Pure. */
function clip(s: string, max = 60): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Build up to `max` concrete starter prompts from the git signals. Changed files
 * → a "Review the changes in <file>" suggestion (and, for source files, a "Write
 * tests for <file>" one); commit subjects → "Continue: <subject>". Always include
 * at least one evergreen safe suggestion. Every token is control-stripped, the
 * list is de-duplicated (case-insensitively) and capped at `max`. Pure.
 */
export function buildExampleCommands(signals: GitSignals, max = MAX_EXAMPLES): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string): void => {
    const key = s.toLowerCase();
    if (!s || seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  for (const file of signals.recentFiles) {
    const clean = clip(sanitizeSignal(file));
    if (!clean) continue;
    add(`Review the changes in ${clean}`);
    if (isSourceFile(clean)) add(`Write tests for ${clean}`);
  }
  for (const subject of signals.recentSubjects) {
    const clean = clip(sanitizeSignal(subject));
    if (clean) add(`Continue: ${clean}`);
  }

  // Reserve at least one evergreen slot so a suggestion set is never purely
  // git-derived — fill the rest with git suggestions, then top up with evergreen.
  const gitCap = Math.max(0, max - 1);
  const trimmed = out.slice(0, gitCap);
  for (const ever of EVERGREEN) {
    if (trimmed.length >= max) break;
    const key = ever.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    trimmed.push(ever);
  }
  return trimmed.slice(0, max);
}

/** The safe generic fallback shown when there are no git signals at all. Pure. */
export function genericExampleCommands(): string[] {
  return [
    ...EVERGREEN,
    "Run the test suite and report what fails",
    "List the open goals and pick the next step",
  ].slice(0, MAX_EXAMPLES);
}

/** Source files worth a "write tests" suggestion (skip docs/config/lockfiles/tests). */
function isSourceFile(file: string): boolean {
  if (/\.(test|spec)\.[a-z]+$/i.test(file)) return false; // already a test
  return /\.(ts|tsx|js|jsx|rs|py|go|java|rb|c|cc|cpp|h|hpp|swift)$/i.test(file);
}

/** Parse `git diff --name-only HEAD~3` output into a de-duplicated file list. Pure. */
export function parseDiffNames(out: string): string[] {
  const seen = new Set<string>();
  const files: string[] = [];
  for (const line of out.split("\n")) {
    const file = line.trim();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    files.push(file);
  }
  return files;
}

/** Parse `git log --oneline -5` output into commit subject lines (sha stripped). Pure. */
export function parseLogSubjects(out: string): string[] {
  const subjects: string[] = [];
  for (const line of out.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // `--oneline` rows are "<short-sha> <subject>"; drop the leading hash.
    const subject = trimmed.replace(/^[0-9a-f]{7,40}\s+/i, "").trim();
    if (subject) subjects.push(subject);
  }
  return subjects;
}

/**
 * Gather git signals via the injected runner. Parses recent changed files +
 * recent commit subjects; ANY runner failure (no git, not a repo, shallow clone)
 * → empty signals (errors-as-values, never throws). The host then falls back to
 * `genericExampleCommands()`. The only I/O in this module.
 */
export async function gatherGitSignals(deps: GatherDeps): Promise<GitSignals> {
  const base = ["-C", deps.root];
  try {
    const [diffOut, logOut] = await Promise.all([
      deps.run([...base, "diff", "--name-only", DIFF_RANGE]),
      deps.run([...base, "log", "--oneline", `-${LOG_COUNT}`]),
    ]);
    return {
      recentFiles: parseDiffNames(diffOut),
      recentSubjects: parseLogSubjects(logOut),
    };
  } catch {
    return { recentFiles: [], recentSubjects: [] };
  }
}

/**
 * Render suggestions as a compact "Try:" block. Empty list → "" (the host shows
 * nothing). Pure — the host gates on whether to call it. Mirrors the clarity-gate
 * / project-onboarding note shape.
 */
export function formatExamples(cmds: string[]): string {
  if (cmds.length === 0) return "";
  const lines = cmds.map((c) => `  • ${c}`);
  return ["Try:", ...lines].join("\n");
}
