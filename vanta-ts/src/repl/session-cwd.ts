// VANTA-CD-CMD — session-scoped working directory for child-process spawns
// (shell_cmd / run_code). A convenience layer ONLY: it changes WHERE an approved
// command runs, never the kernel gate — every command is still assess()'d and
// every path is still scope-enforced.
//
// The cwd lives OUTSIDE the cached stable prompt prefix, so changing it does NOT
// invalidate the prompt cache. The store is a process-scoped holder so the `/cd`
// handler (REPL) and the spawn site (tools/shell-cmd.ts) share one source of
// truth without threading it through ToolContext. resolveCdTarget is pure.

import { isAbsolute, resolve } from "node:path";

/** Outcome of resolving a `/cd <path>` argument: a directory, or an error. */
export type CdResolution = { ok: true; dir: string } | { ok: false; error: string };

/** Predicate injected for testability — true when `dir` exists as a directory. */
export type DirExists = (dir: string) => boolean;

/**
 * Resolve a `/cd` argument against `currentDir`, validating existence. Pure.
 * - empty arg → error (the no-arg "print current" path is the handler's job)
 * - absolute path → used as-is; relative path → resolved against `currentDir`
 * - non-existent target → error (errors-as-values, never throws)
 * Tilde (`~`) is NOT expanded here — the kernel/scope layer owns home access;
 * pass an already-expanded path if you need it.
 */
export function resolveCdTarget(arg: string, currentDir: string, exists: DirExists): CdResolution {
  const trimmed = arg.trim();
  if (trimmed === "") {
    return { ok: false, error: "expected a path: /cd <path>" };
  }
  const dir = isAbsolute(trimmed) ? resolve(trimmed) : resolve(currentDir, trimmed);
  if (!exists(dir)) {
    return { ok: false, error: `no such directory: ${dir}` };
  }
  return { ok: true, dir };
}

// Process-scoped current directory. null = "never changed", so the spawn site
// falls back to its root (process.cwd() / VANTA_ROOT) and stays byte-identical
// until a /cd happens.
let current: string | null = null;

/** The session's working directory, or process.cwd() if `/cd` was never used. */
export function sessionCwd(): string {
  return current ?? process.cwd();
}

/** True once `/cd` has changed the directory this session (vs. the default). */
export function isCwdChanged(): boolean {
  return current !== null;
}

/** Set the session's working directory. Validated by the caller (resolveCdTarget). */
export function setSessionCwd(dir: string): void {
  current = dir;
}

/** Reset to the default (process.cwd()) — for tests and session reset. */
export function resetSessionCwd(): void {
  current = null;
}
