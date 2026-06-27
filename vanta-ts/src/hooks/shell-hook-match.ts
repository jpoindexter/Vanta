// Hook matching: which configured hooks fire for an event given a MatchContext.
// Pure predicates split out of shell-hooks.ts (the schema + loader) so the
// conditional-matcher logic (tool-name/input/prompt regex, error/session/
// maintenance filters) lives in one cohesive place. Types only flow back from
// shell-hooks.ts, so there is no runtime dependency cycle.

import type { ShellHook, ShellHookEvent, ShellHooksConfig, MatchContext } from "./shell-hooks.js";

/** Returns true if pattern (regex) matches text. Absent pattern = match all; absent text with pattern = no match. */
function matchesPattern(pattern: string | undefined, text: string | undefined): boolean {
  if (pattern === undefined) return true;
  if (text === undefined) return false;
  try { return new RegExp(pattern).test(text); }
  catch { return pattern === text; }
}

function namePatternBlocked(hook: ShellHook, ctx: MatchContext): boolean {
  const pat = hook.toolNamePattern ?? hook.matcher;
  const matchTarget = ctx.toolName ?? ctx.matcherValue;
  // Matcher patterns only apply when the caller supplies the event-specific value.
  return pat !== undefined && matchTarget !== undefined && !matchesPattern(pat, matchTarget);
}

function sessionTypeBlocked(hook: ShellHook, ctx: MatchContext): boolean {
  return !!(hook.sessionType && ctx.sessionType && hook.sessionType !== ctx.sessionType);
}

function maintenanceBlocked(hook: ShellHook, ctx: MatchContext): boolean {
  return hook.maintenance !== undefined && hook.maintenance !== (ctx.maintenance ?? false);
}

function hookMatches(hook: ShellHook, ctx: MatchContext): boolean {
  if (namePatternBlocked(hook, ctx)) return false;
  if (!matchesPattern(hook.inputPattern, ctx.toolInputJson)) return false;
  if (!matchesPattern(hook.promptPattern, ctx.prompt)) return false;
  if (hook.onError && ctx.isError !== true) return false;
  if (sessionTypeBlocked(hook, ctx)) return false;
  if (maintenanceBlocked(hook, ctx)) return false;
  return true;
}

/** Hooks for an event whose conditional matchers all pass against ctx. */
export function matchingHooks(config: ShellHooksConfig, event: ShellHookEvent, ctx: MatchContext = {}): ShellHook[] {
  return (config[event] ?? []).filter((h) => hookMatches(h, ctx));
}
