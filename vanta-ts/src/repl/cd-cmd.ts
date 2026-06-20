import { existsSync, statSync } from "node:fs";
import type { SlashHandler, SlashResult } from "./types.js";
import { resolveCdTarget, sessionCwd, setSessionCwd, type DirExists } from "./session-cwd.js";

/** Default existence check: a path that exists AND is a directory. */
function dirExists(dir: string): boolean {
  try {
    return existsSync(dir) && statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Build the `/cd` handler over injected getter/setter/existence (default: the
 * shared session-cwd store + a real fs check). Pure aside from the setter call.
 * - no arg → print the current session working directory
 * - arg → resolve against the current dir, validate, set
 */
export function buildCdHandler(
  get: () => string = sessionCwd,
  set: (dir: string) => void = setSessionCwd,
  exists: DirExists = dirExists,
): SlashHandler {
  return (arg): SlashResult => {
    if (arg.trim() === "") {
      return { output: `  ${get()}` };
    }
    const resolved = resolveCdTarget(arg, get(), exists);
    if (!resolved.ok) {
      return { output: `  ${resolved.error}` };
    }
    set(resolved.dir);
    return { output: `  ◈ working directory → ${resolved.dir}` };
  };
}

/** `/cd <path>` — change the session's working directory for shell_cmd/run_code;
 *  `/cd` (no arg) prints the current one. Commands still pass through the kernel. */
export const cd: SlashHandler = buildCdHandler();
