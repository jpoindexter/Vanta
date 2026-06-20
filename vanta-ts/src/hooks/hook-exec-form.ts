import type { ShellHook } from "./shell-hooks.js";

// VANTA-HOOK-EXEC-FORM — pure form resolver for command/shell hooks.
//
// A command/shell hook can spawn two ways:
//   - shell form: `command` is a shell string run via `sh -c` (existing path).
//   - exec form:  `args: string[]` is an argv spawned DIRECTLY via execFile
//                 (no shell), so the command string is never interpreted by a
//                 shell — no injection/quoting hazard.
//
// This module decides which form a hook resolves to and builds the argv. It is
// PURE (no spawn, no I/O) so the decision + argv build are unit-testable in
// isolation. Errors are returned as values, never thrown.

/** Exec form: spawn `file` with `args` directly (no shell). */
export type ExecForm = { form: "exec"; file: string; args: string[] };

/** Shell form: run `command` through a shell (unchanged legacy path). */
export type ShellForm = { form: "shell"; command: string };

/** A hook that cannot resolve to a runnable command/shell form. */
export type FormError = { form: "error"; reason: string };

export type HookExec = ExecForm | ShellForm | FormError;

/**
 * Resolve a command/shell hook to its spawn form.
 *
 * Precedence: `args` (exec form) is checked FIRST — when present it wins over
 * `command`, because an explicit argv is the safe, shell-free request. Without
 * `args`, a non-empty `command` is the shell form. Validation:
 *   - exec form requires a non-empty argv whose first element (the file) is a
 *     non-empty string; an empty/blank argv is an error.
 *   - absent both `args` and `command` is an error.
 *
 * Only relevant for command/shell hooks; callers route other hook types
 * (http/mcp_tool/prompt/agent) before reaching here.
 */
export function resolveHookExec(hook: ShellHook): HookExec {
  if (hook.args !== undefined) return resolveExecForm(hook.args);
  const command = hook.command?.trim();
  if (command) return { form: "shell", command: hook.command as string };
  return { form: "error", reason: "hook has neither args nor command" };
}

/** Build + validate the exec form from a raw argv. */
function resolveExecForm(argv: readonly string[]): HookExec {
  const file = argv[0]?.trim();
  if (!file) return { form: "error", reason: "exec-form hook requires a non-empty args[0] (the file to spawn)" };
  return { form: "exec", file, args: argv.slice(1) };
}
