// VANTA-BASH-CLASSIFIER — classify a bash command as clearly SAFE (read-only /
// idempotent) so it can auto-approve without a dialog; everything unsafe or
// unknown falls through to the normal permission flow. Off by default
// (VANTA_BASH_CLASSIFIER). CONSERVATIVE by design: a false negative just asks
// (harmless), a false positive would skip a prompt — so the bar for "safe" is
// high. The kernel block floor is never crossed (the gate only loosens an ASK,
// never a block). Because every agent (incl. swarm/coordinator workers) routes
// tool calls through the same applySafetyGate, they all respect this result.

export type BashSafety = "safe" | "unknown";

export function bashClassifierEnabled(env: NodeJS.ProcessEnv): boolean {
  const v = (env.VANTA_BASH_CLASSIFIER ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

// Any of these anywhere in the command → not classifiable as safe (shell control,
// redirection, chaining, substitution, network, or mutation verbs).
const RISKY = /[|<>;&`]|\$\(|\b(sudo|doas|rm|rmdir|mv|cp|dd|chmod|chown|chgrp|ln|kill|pkill|killall|curl|wget|nc|ssh|scp|rsync|tee|truncate|mkfifo|shutdown|reboot|mount|eval|exec|source|export|set|trap|nohup|xargs)\b/i;

// First word must be one of these read-only/idempotent commands.
const SAFE_HEADS = new Set([
  "ls", "pwd", "echo", "cat", "head", "tail", "wc", "which", "type", "env", "printenv",
  "date", "whoami", "hostname", "uname", "stat", "file", "du", "df", "basename", "dirname",
  "realpath", "true", "false", "grep", "rg", "find", "tree", "id", "groups", "uptime", "git",
]);

// git is safe only for these strictly read-only subcommands (no branch/config/
// remote/tag — those have write forms a positional arg would sneak through).
const GIT_SAFE_SUB = new Set(["status", "diff", "log", "show", "rev-parse", "ls-files", "describe", "blame", "shortlog"]);
// find is safe only without action flags that execute/delete.
const FIND_UNSAFE = /-\s*(exec|execdir|delete|ok|okdir|fprint|fls)\b/i;

/** Classify a bash command. SAFE only when the head is read-only, the command has
 * no risky tokens, and any subcommand (git) / flags (find) are themselves safe. */
export function classifyBashSafety(command: string): BashSafety {
  const cmd = command.trim();
  if (!cmd || RISKY.test(cmd)) return "unknown";
  const tokens = cmd.split(/\s+/);
  const head = tokens[0] ?? "";
  if (!SAFE_HEADS.has(head)) return "unknown";
  if (head === "git" && !GIT_SAFE_SUB.has(tokens[1] ?? "")) return "unknown";
  if (head === "find" && FIND_UNSAFE.test(cmd)) return "unknown";
  return "safe";
}
