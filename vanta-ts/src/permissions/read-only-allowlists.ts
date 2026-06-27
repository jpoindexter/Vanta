/**
 * VANTA-READ-ONLY-CMD-MAP — the per-program allowlist DATA.
 *
 * The data half of the read-only command classifier: which git/gh subcommands
 * and shell programs only read, plus the flag sets that mark a write. The
 * classifier LOGIC that consults these tables lives in `read-only-commands.ts`
 * and re-exports the three public sets, so importers keep their module path.
 * Kept separate so a security review of "what is allowlisted as read-only"
 * reads one focused data file.
 */

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

/** Long/short flags that mutate git/gh state regardless of subcommand. */
export const MUTATING_FLAGS: ReadonlySet<string> = new Set([
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

export const GH_API_METHOD_FLAGS: ReadonlySet<string> = new Set(["-X", "--method"]);
export const GH_API_BODY_FLAGS: ReadonlySet<string> = new Set(["-f", "--field", "--input"]);
export const GH_API_READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);
