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

import {
  READ_ONLY_GIT,
  READ_ONLY_GH,
  READ_ONLY_SHELL,
  MUTATING_FLAGS,
  GH_API_METHOD_FLAGS,
  GH_API_BODY_FLAGS,
  GH_API_READ_METHODS,
} from "./read-only-allowlists.js";

// Re-export the public allowlists so importers/tests keep their module path.
export { READ_ONLY_GIT, READ_ONLY_GH, READ_ONLY_SHELL };

export type CommandClass = "read-only" | "unknown" | "mutating";

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
