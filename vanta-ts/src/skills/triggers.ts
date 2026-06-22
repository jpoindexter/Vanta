import { slugifySkillName } from "../store/home.js";
import { SHELL_HOOK_EVENTS, type ShellHook, type ShellHookEvent } from "../hooks/shell-hooks.js";
import type { Skill, SkillTrigger } from "./types.js";

// SKILL-TRIGGERS — compile a skill's declared `triggers` into hook entries for
// Vanta (`~/.vanta/hooks.json`) and Claude Code (`~/.claude/settings.json`). PURE.
//
// Firing model (Rule-Zero-safe): each trigger becomes a `command` hook that runs
// `vanta skills trigger-emit <slug> <event>` — which only SURFACES a recall note
// (and, on Stop, injects it as context). It never auto-runs the skill body or any
// irreversible action. The hook's `statusMessage` is the per-event heads-up.

/** Substring every generated hook command carries — lets the upserter find and
 *  replace ONLY generated entries, never hand-written hooks. */
export const TRIGGER_MARKER = "skills trigger-emit";

const KNOWN_EVENTS: ReadonlySet<string> = new Set(SHELL_HOOK_EVENTS);

/** Claude Code events the compiler targets. PreToolUse is supported via the
 *  Vanta→Claude tool map below (Claude tool names differ from Vanta's). */
const CLAUDE_EVENTS: ReadonlySet<string> = new Set(["Stop", "UserPromptSubmit", "PreToolUse"]);

/** Vanta tool name (a trigger `match`) → Claude Code matcher + an optional command
 *  substring the emitter must find in `tool_input.command` (since e.g. a git push is
 *  a `Bash` call, not a `git_push` tool in Claude). Unknown → used as the matcher. */
const VANTA_TO_CLAUDE: Record<string, { matcher: string; inputContains?: string }> = {
  git_push: { matcher: "Bash", inputContains: "git push" },
  git_commit: { matcher: "Bash", inputContains: "git commit" },
  shell_cmd: { matcher: "Bash" },
  run_code: { matcher: "Bash" },
  write_file: { matcher: "Write|Edit" },
  edit_file: { matcher: "Edit" },
  read_file: { matcher: "Read" },
  grep_files: { matcher: "Grep" },
  glob_files: { matcher: "Glob" },
  web_fetch: { matcher: "WebFetch" },
  web_search: { matcher: "WebSearch" },
};

/** Resolve a trigger `match` to a Claude matcher + optional input guard. Pure. */
export function claudeToolMap(match: string | undefined): { matcher: string; inputContains?: string } {
  if (!match) return { matcher: "" };
  return VANTA_TO_CLAUDE[match] ?? { matcher: match };
}

/** The emit command a trigger hook runs. `vantaBin` defaults to the PATH `vanta`. */
export function emitCommand(slug: string, event: string, vantaBin = "vanta"): string {
  return `${vantaBin} skills trigger-emit ${slug} ${event}`;
}

/** One-line heads-up shown by the host before the hook runs (statusMessage). */
function statusFor(skill: Skill, t: SkillTrigger): string {
  return `🎯 ${skill.meta.name}${t.note ? `: ${t.note}` : ` (recall on ${t.event})`}`;
}

/** The recall note the emitter surfaces so the model applies the skill's know-how. */
export function buildTriggerNote(skill: Skill, event: string): string {
  return `🎯 Trigger (${event}): recall and apply skill "${skill.meta.name}" — ${skill.meta.description}`;
}

/** Compile a skill's triggers into Vanta hook entries. Unknown events are skipped
 *  (forward-compatible). `when` containing "error" maps to onError; `match` to a
 *  tool-name pattern. Pure. */
export function compileTriggers(skill: Skill, vantaBin = "vanta"): { event: ShellHookEvent; hook: ShellHook }[] {
  const slug = slugifySkillName(skill.meta.name);
  const out: { event: ShellHookEvent; hook: ShellHook }[] = [];
  for (const t of skill.meta.triggers ?? []) {
    if (!KNOWN_EVENTS.has(t.event)) continue;
    const hook: ShellHook = {
      type: "command",
      command: emitCommand(slug, t.event, vantaBin),
      statusMessage: statusFor(skill, t),
      ...(t.match ? { toolNamePattern: t.match } : {}),
      ...(/error/i.test(t.when ?? "") ? { onError: true } : {}),
    };
    out.push({ event: t.event as ShellHookEvent, hook });
  }
  return out;
}

/** One Claude Code settings.json hook entry: `hooks.<event> = [{matcher, hooks:[…]}]`. */
export type ClaudeHookEntry = { event: string; matcher: string; command: string };

/** Compile a skill's triggers into Claude Code settings.json entries. v1 supports
 *  only Stop + UserPromptSubmit (Claude tool names differ from Vanta's, so
 *  fine-grained PreToolUse matching is deferred). Pure. */
export function compileTriggersForClaude(skill: Skill, vantaBin = "vanta"): ClaudeHookEntry[] {
  const slug = slugifySkillName(skill.meta.name);
  const seen = new Set<string>();
  const out: ClaudeHookEntry[] = [];
  for (const t of skill.meta.triggers ?? []) {
    if (!CLAUDE_EVENTS.has(t.event)) continue;
    const matcher = t.event === "PreToolUse" ? claudeToolMap(t.match).matcher : "";
    const key = `${t.event}:${matcher}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // `--claude` tells the emitter to read Claude's stdin payload + emit Claude's
    // hookSpecificOutput JSON (vs Vanta's stderr/additionalContext form).
    out.push({ event: t.event, matcher, command: `${emitCommand(slug, t.event, vantaBin)} --claude 2>/dev/null` });
  }
  return out;
}

const cmdOf = (h: unknown): string => (h && typeof h === "object" ? String((h as { command?: unknown }).command ?? "") : "");

/** Merge compiled trigger hooks into a hooks.json config object: drop prior
 *  GENERATED entries (idempotent), keep hand-written ones, add current. Pure +
 *  tolerant (non-array event values are skipped). */
export function mergeVantaHooks(
  existing: Record<string, unknown>,
  compiled: { event: ShellHookEvent; hook: ShellHook }[],
): Record<string, ShellHook[]> {
  const out: Record<string, ShellHook[]> = {};
  for (const [event, val] of Object.entries(existing)) {
    if (!Array.isArray(val)) continue;
    const kept = (val as ShellHook[]).filter((h) => !cmdOf(h).includes(TRIGGER_MARKER));
    if (kept.length) out[event] = kept;
  }
  for (const { event, hook } of compiled) (out[event] ??= []).push(hook);
  return out;
}

type ClaudeEntry = { matcher?: string; hooks?: unknown[] };

/** Merge compiled Claude entries into a settings.json object: drop prior generated
 *  entries, keep the user's hand-written Claude hooks, add current. Pure + tolerant. */
export function mergeClaudeSettings(
  settings: Record<string, unknown>,
  compiled: ClaudeHookEntry[],
): Record<string, unknown> {
  const src = (settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {}) as Record<string, unknown>;
  const hooks: Record<string, ClaudeEntry[]> = {};
  for (const [event, val] of Object.entries(src)) {
    if (!Array.isArray(val)) continue;
    const kept = (val as ClaudeEntry[]).filter((e) => !(e.hooks ?? []).some((h) => cmdOf(h).includes(TRIGGER_MARKER)));
    if (kept.length) hooks[event] = kept;
  }
  for (const c of compiled) (hooks[c.event] ??= []).push({ matcher: c.matcher, hooks: [{ type: "command", command: c.command }] });
  return { ...settings, hooks };
}
