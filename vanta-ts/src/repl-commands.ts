import { dispatch } from "./repl/handlers.js";
import { readSkill } from "./skills/store.js";
import type { ReplCtx, SlashResult } from "./repl/types.js";

// Slash commands for the interactive surface — the Vanta `/` set,
// scoped to what Vanta actually has. The core is `executeSlash`, which RETURNS
// its output as a string (no console side effects) so both the readline REPL
// and the Ink TUI can drive it. `runSlashCommand` is the readline wrapper that
// prints the result. Each command is a small handler in repl/handlers.ts
// (HANDLERS registry); none duplicates logic — they reuse existing subsystems.

// Public surface (re-exported so callers import from one place).
export type { ReplState, ReplCtx, SlashResult, SlashHandler } from "./repl/types.js";
export { SLASH_COMMANDS, SLASH_HELP } from "./repl/catalog.js";
export { maybeDroppedImage, maybeDroppedVideo, formatExport, formatHistory } from "./repl/format.js";
export { HANDLERS } from "./repl/handlers.js";

/**
 * Run a `/command`, returning its output and control signals. Pure of console
 * side effects; it may mutate `ctx.convo` / `ctx.state` (that IS the command's
 * job for /clear and /resume). Unknown commands are reported, not sent to the
 * model.
 */
export async function executeSlash(input: string, ctx: ReplCtx): Promise<SlashResult> {
  const [cmd, ...rest] = input.slice(1).split(/\s+/);
  const name = cmd ?? "";
  const arg = rest.join(" ").trim();
  // Check for a skill BEFORE dispatching so collision detection can warn.
  const skill = name ? await readSkill(name, ctx.env) : null;
  const result = await dispatch(name, arg, ctx);
  if (result) {
    // Built-in/plugin commands win. Warn if a same-named skill exists so the user knows it's shadowed.
    if (skill) {
      return { ...result, output: `  ⚠ /${name} matches an installed skill but a command takes precedence.\n${result.output ?? ""}`.trimEnd() };
    }
    return result;
  }

  // Generic skill aliases: if `/hill-climb` matches a stored skill, treat it as
  // `vanta skill hill-climb`. With an argument, run a normal agent turn primed
  // by the skill body; with no argument, print the skill so the user can inspect
  // it. Explicit HANDLERS above always win, so built-in slash commands are stable.
  if (skill) {
    if (!arg) {
      const desc = skill.meta.description ? ` — ${skill.meta.description}` : "";
      return { output: `◈ [${skill.meta.name}]${desc}\n  /${skill.meta.name} <instruction> to run it` };
    }
    return { resend: `${skill.body}\n\n${arg}`, resendDisplay: arg };
  }

  return { output: `  unknown command /${name} — /help for the list`, unknown: true };
}

/**
 * Readline wrapper around `executeSlash`: prints the output and returns whether
 * the REPL should exit. The TUI calls `executeSlash` directly instead.
 */
export async function runSlashCommand(input: string, ctx: ReplCtx): Promise<boolean> {
  const result = await executeSlash(input, ctx);
  if (result.output) console.log(result.output);
  return result.exit ?? false;
}
