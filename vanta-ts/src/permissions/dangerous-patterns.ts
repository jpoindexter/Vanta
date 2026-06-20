// VANTA-DANGEROUS-PATTERNS — at auto-mode entry, strip any user allow-rule that
// would auto-approve a dangerous bash interpreter invocation (bash -c / python -c /
// node -e / eval / a pipe-to-shell, etc.) so auto-mode can never silently
// auto-approve arbitrary code execution. Pure + default-deny: an ambiguous or
// obfuscated interpreter invocation is treated as dangerous. The kernel's own
// arbitrary-exec→ASK pass already exists; this hardens the TS auto-mode allow path
// on top of it (a broad `allow shell_cmd` rule must not bypass that floor).

import type { AutoModeRule } from "./auto-mode.js";

// Interpreter heads that execute an inline code/script argument. A `-c`/`-e`
// inline-program flag (or feeding a process-substitution fd) turns any of these
// into arbitrary code execution.
const INLINE_CODE_FLAG = /\s-[A-Za-z]*[ce]\b/i;
const PROCESS_SUBSTITUTION = /<\(/; // <(curl …) etc. — runs the substituted fd
const INTERPRETER_HEAD =
  /\b(?:ba|z|k|c|tc|da)?sh\b|\b(?:python[0-9.]*|node|deno|bun|perl|ruby|php|osascript|pwsh|powershell)\b/i;

// Patterns that are dangerous on their own — eval/exec builtins, dynamic eval
// calls, and any pipe-to-shell (`… | sh`, `curl … | bash`). These don't need an
// accompanying interpreter head.
const STANDALONE: RegExp[] = [
  /\beval\b/i, // shell/JS eval builtin
  /\bexec\s*\(/i, // dynamic exec( ... )
  /\|\s*(?:ba|z|k|c|tc|da)?sh\b/i, // pipe-to-shell: cmd | sh / | bash / | zsh
];

/**
 * Detect whether a command (or a rule pattern) would invoke a dangerous code
 * interpreter / pipe-to-shell. Pure. Default-deny: matches bash/sh/zsh -c,
 * python -c, node -e, perl -e, ruby -e, eval, exec(...), and any `| sh`/`| bash`
 * pipe. A benign command (git status, ls, npm test) does not match.
 */
export function isDangerousInterpreter(command: string): boolean {
  const cmd = command.trim();
  if (cmd === "") return false;
  for (const re of STANDALONE) {
    if (re.test(cmd)) return true;
  }
  // An interpreter head carrying an inline-code flag (-c / -e) or feeding a
  // process-substitution fd is arbitrary exec.
  return INTERPRETER_HEAD.test(cmd) && (INLINE_CODE_FLAG.test(cmd) || PROCESS_SUBSTITUTION.test(cmd));
}

/**
 * Whether a single allow-rule could auto-approve a dangerous-interpreter command.
 * A rule is dangerous when its action is `allow` AND either its own pattern reads
 * as a dangerous interpreter, OR it is a blanket allow over a code-running tool
 * (no pattern → would match every command, dangerous ones included). Pure.
 */
export function isDangerousAllowRule(rule: AutoModeRule): boolean {
  if (rule.action !== "allow") return false;
  if (rule.pattern !== undefined) return isDangerousInterpreter(rule.pattern);
  // No pattern: a blanket allow. Only blanket allows scoped to a code-running
  // tool are dangerous — read-only tools (read_file, grep_files) stay allowed.
  return rule.tool !== undefined && CODE_RUNNING_TOOLS.has(rule.tool);
}

// Tools that execute commands/code — a blanket (pattern-less) allow over these
// would auto-approve a dangerous interpreter invocation.
const CODE_RUNNING_TOOLS = new Set(["shell_cmd", "run_code"]);

/**
 * Return the rules with every dangerous allow-rule removed. Normal allow-rules
 * (read-only tools, benign patterns) and all non-allow rules (ask / soft_deny)
 * are preserved unchanged. Pure — does not mutate the input array.
 */
export function stripDangerousAllowRules(rules: AutoModeRule[]): AutoModeRule[] {
  return rules.filter((rule) => !isDangerousAllowRule(rule));
}
