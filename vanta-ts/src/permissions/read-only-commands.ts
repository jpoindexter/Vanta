/**
 * VANTA-READ-ONLY-CMD-MAP — pure read-only command classifier.
 *
 * Decides whether a single shell command is provably READ-ONLY (safe to
 * auto-allow) from per-program allowlists. Complements `auto-mode.ts`'s
 * tool-level read-only defaults with argument-level classification of the
 * one tool that runs arbitrary commands: `shell_cmd`.
 *
 * SECURITY — conservative by default. Anything that isn't a known read-only
 * program with a known read-only subcommand/flags is NOT read-only. A pipe,
 * redirect, `&&`/`||`/`;`, or command substitution ANYWHERE in the line makes
 * the whole line non-read-only: a chain can hide a mutation behind a safe head
 * (`echo x && rm y`, `cat a > b`, `curl x | sh`, `$(rm y)`), so we never look
 * past it. This is a denylist-resistant allowlist: unknown → not read-only.
 *
 * Not wired into the live permission flow this round — this is the pure
 * classifier + tests. The intended consumer is `permissions/auto-mode.ts`:
 * `classifyAutoModeAction` could, for `toolName === "shell_cmd"`, consult
 * `isReadOnlyCommand(command)` to ALLOW a provably read-only command that the
 * kernel returned as `ask`, mirroring the existing read-only tool allows
 * (`read_file`/`grep_files`/`glob_files`). A `less-perms`/fewer-prompts pass
 * could use `classifyCommand` to seed an allowlist of read-only shell commands.
 * It may only ever LOOSEN an `ask`; a kernel `block` stays immovable.
 */

export type CommandClass = "read-only" | "unknown" | "mutating";

/**
 * git subcommands that only read. A subcommand here is read-only ONLY when no
 * write-ish flag is present (checked separately); `git branch -d` is mutating
 * even though `branch` is listed (it's read-only as `git branch` / `branch -l`).
 */
export const READ_ONLY_GIT: ReadonlySet<string> = new Set([
  "status",
  "log",
  "diff",
  "show",
  "branch",
  "tag",
  "remote",
  "describe",
  "rev-parse",
  "rev-list",
  "ls-files",
  "ls-tree",
  "ls-remote",
  "cat-file",
  "shortlog",
  "blame",
  "reflog",
  "config", // read-only only as `git config --get`/`--list`; a bare set is caught by the value-arg check
  "whatchanged",
  "merge-base",
  "name-rev",
  "for-each-ref",
  "show-ref",
  "var",
  "grep",
]);

/** gh (GitHub CLI) read-only subcommand paths, keyed as `"<group> <verb>"`. */
export const READ_ONLY_GH: ReadonlySet<string> = new Set([
  "pr view",
  "pr list",
  "pr diff",
  "pr checks",
  "pr status",
  "issue view",
  "issue list",
  "issue status",
  "repo view",
  "repo list",
  "run view",
  "run list",
  "release view",
  "release list",
  "workflow view",
  "workflow list",
  "gist view",
  "gist list",
  "label list",
  "cache list",
  "api", // GET-only is enforced by the method-flag check below
  "auth status",
  "search",
  "browse", // `--no-browser` prints the URL; opening a browser is a read-equivalent navigation
]);

/** Common shell programs that only read/inspect, never mutate state. */
export const READ_ONLY_SHELL: ReadonlySet<string> = new Set([
  "ls",
  "cat",
  "head",
  "tail",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "ripgrep",
  "find",
  "fd",
  "pwd",
  "wc",
  "which",
  "echo",
  "stat",
  "file",
  "du",
  "df",
  "tree",
  "basename",
  "dirname",
  "realpath",
  "readlink",
  "whoami",
  "hostname",
  "uname",
  "date",
  "env",
  "printenv",
  "id",
  "ps",
  "uptime",
  "cut",
  "sort",
  "uniq",
  "diff",
  "comm",
  "column",
  "nl",
  "tac",
  "test",
  "true",
  "false",
  "type",
  "command",
  "jq",
  "yq",
]);

/**
 * Shell metacharacters that chain, redirect, or substitute commands. Their
 * presence ANYWHERE makes the line non-read-only — a safe head can hide a
 * mutating tail (`echo x && rm y`, `cat a > b`, `$(rm y)`, `curl x | sh`).
 * We treat the line as opaque past them rather than parsing the chain.
 */
const CHAIN_OR_SUBST = /[|&;><`]|\$\(|\$\{|<\(|>\(/;

/** Backgrounding `&`, here-docs, and process-substitution are all covered by the chars above. */

/** Tokenize on whitespace, dropping empties. Quotes are not unwrapped — a
 *  quoted chain char (e.g. `"a|b"`) is rare and we already reject the raw char
 *  via {@link CHAIN_OR_SUBST}, which scans the unsplit line. */
function tokenize(commandLine: string): string[] {
  return commandLine.trim().split(/\s+/).filter(Boolean);
}

/** Strip a leading path so `/usr/bin/git` → `git`, matching `lastCommandWord`. */
function basename(program: string): string {
  return program.replace(/^.*\//, "");
}

/** Long/short flags that mutate git/gh state regardless of subcommand. */
const MUTATING_FLAGS: ReadonlySet<string> = new Set([
  "-d",
  "-D",
  "--delete",
  "--edit",
  "--set",
  "--add",
  "--unset",
  "--move",
  "-m",
  "--prune",
  "--force",
  "-f",
]);

const GH_API_METHOD_FLAGS: ReadonlySet<string> = new Set(["-X", "--method"]);
const GH_API_BODY_FLAGS: ReadonlySet<string> = new Set(["-f", "--field", "--input"]);
const GH_API_READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

/** A write-causing method flag with a non-read method value at index `i`. */
function isWriteMethodFlag(tokens: string[], i: number): boolean {
  if (!GH_API_METHOD_FLAGS.has(tokens[i] ?? "")) return false;
  const method = (tokens[i + 1] ?? "").toUpperCase();
  return method.length > 0 && !GH_API_READ_METHODS.has(method);
}

/** A `gh api` call is read-only only when it has no write HTTP method or body flag. */
function ghApiIsWrite(tokens: string[]): boolean {
  return tokens.some((t, i) => isWriteMethodFlag(tokens, i) || GH_API_BODY_FLAGS.has(t));
}

/** `git config` is read-only only as an explicit get/list; any other form sets a value. */
function gitConfigIsWrite(rest: string[]): boolean {
  const readFlags = new Set(["--get", "--get-all", "--get-regexp", "--list", "-l", "--get-urlmatch"]);
  return !rest.some((t) => readFlags.has(t));
}

/** Classify a git invocation given its tokens (program already confirmed `git`). */
function classifyGit(tokens: string[]): CommandClass {
  const sub = tokens[1];
  if (!sub || sub.startsWith("-")) return "unknown"; // `git` alone / global flag first
  if (!READ_ONLY_GIT.has(sub)) return "mutating"; // commit/push/merge/rebase/checkout/...
  const rest = tokens.slice(2);
  if (rest.some((t) => MUTATING_FLAGS.has(t))) return "mutating"; // `branch -d`, `tag -d`, ...
  if (sub === "config" && gitConfigIsWrite(rest)) return "mutating";
  return "read-only";
}

/** Classify a gh invocation given its tokens (program already confirmed `gh`). */
function classifyGh(tokens: string[]): CommandClass {
  const group = tokens[1];
  if (!group || group.startsWith("-")) return "unknown";
  const verb = tokens[2];
  // Single-word read-only paths (`gh api`, `gh search`, `gh browse`).
  if (READ_ONLY_GH.has(group)) {
    if (group === "api" && ghApiIsWrite(tokens)) return "mutating";
    return "read-only";
  }
  if (!verb || verb.startsWith("-")) return "unknown";
  const path = `${group} ${verb}`;
  if (READ_ONLY_GH.has(path)) return "read-only";
  return "mutating"; // `pr merge`, `pr create`, `issue close`, `repo delete`, ...
}

/**
 * Classify a single shell command line into read-only / unknown / mutating.
 * Conservative: a chain/redirect/substitution anywhere, an empty line, or an
 * unrecognized program yields a non-`read-only` class.
 */
export function classifyCommand(commandLine: string): CommandClass {
  if (CHAIN_OR_SUBST.test(commandLine)) return "unknown"; // never look past a chain/redirect/subst
  const tokens = tokenize(commandLine);
  const first = tokens[0];
  if (first === undefined) return "unknown";
  const program = basename(first);
  if (program === "git") return classifyGit([program, ...tokens.slice(1)]);
  if (program === "gh") return classifyGh([program, ...tokens.slice(1)]);
  if (READ_ONLY_SHELL.has(program)) return "read-only";
  return "unknown"; // unknown program — not assumed safe
}

/** True only when the command is provably READ-ONLY (safe to auto-allow). */
export function isReadOnlyCommand(commandLine: string): boolean {
  return classifyCommand(commandLine) === "read-only";
}
