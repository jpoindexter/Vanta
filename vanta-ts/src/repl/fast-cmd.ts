import type { ProviderSpeed } from "../providers/model-settings.js";
import { activeProviderSettings, applyProviderSettings, parseModelSettingsScope } from "./provider-settings.js";
import type { ReplCtx, SlashHandler, SlashResult } from "./types.js";

// `/fast` — the toggle Claude Code and Codex users already know. It flips the
// provider's fast/priority speed tier for the current model:
//   Anthropic Opus 5 / Opus 4.8 → speed:"fast" + the fast-mode beta header
//   Codex                       → service_tier:"fast"
// Same model, same quality, faster output tokens at premium cost. Bare `/fast`
// toggles; `on`/`off` are explicit. `--global` persists as the project default,
// otherwise the change is session-scoped.

const ON = new Set(["on", "true", "1", "yes", "enable", "enabled"]);
const OFF = new Set(["off", "false", "0", "no", "disable", "disabled"]);

export type FastIntent =
  | { kind: "toggle" }
  | { kind: "set"; value: ProviderSpeed }
  | { kind: "status" }
  | { kind: "error"; message: string };

/** Pure: map the argument to an intent. Unknown words are an error, not a guess. */
export function parseFastArg(value: string): FastIntent {
  const word = value.trim().toLowerCase();
  if (!word) return { kind: "toggle" };
  if (word === "status" || word === "?") return { kind: "status" };
  if (ON.has(word)) return { kind: "set", value: "fast" };
  if (OFF.has(word)) return { kind: "set", value: "standard" };
  return { kind: "error", message: `unknown option "${word}"` };
}

const USAGE = "  usage: /fast [on|off|status] [--session|--global]";

/** Pure: the confirmation line for a resolved speed. */
export function fastStatusLine(speed: ProviderSpeed, scopeNote: string): string {
  return speed === "fast"
    ? `  ↯ fast mode ON${scopeNote} · same model, faster output tokens, premium rate`
    : `  fast mode OFF${scopeNote} · standard speed and pricing`;
}

/** The message shown when the active model has no fast tier to toggle. */
export function fastUnsupportedMessage(providerId: string, modelId: string): string {
  return `  fast mode is not available on ${providerId}/${modelId}.\n`
    + "  Anthropic supports it on Opus 5 and Opus 4.8; Codex supports it on its fast service tier.\n"
    + "  Use /model to switch to a supported model.";
}

/** Pure: the speed a resolved intent asks for, given what is active now. */
export function nextFastSpeed(intent: FastIntent, current: ProviderSpeed): ProviderSpeed {
  if (intent.kind === "set") return intent.value;
  return current === "fast" ? "standard" : "fast";
}

/** Pure: the early-exit output for this request, or null to apply a change. */
function preflight(intent: FastIntent, active: ReturnType<typeof activeProviderSettings>): string | null {
  if (intent.kind === "error") return `  ${intent.message}\n${USAGE}`;
  const capability = active.capabilities.speed;
  if (!capability?.options.includes("fast")) return fastUnsupportedMessage(active.providerId, active.modelId);
  if (intent.kind === "status") return fastStatusLine(active.current.speed ?? capability.defaultValue, "");
  return null;
}

export const fast: SlashHandler = async (arg, ctx: ReplCtx): Promise<SlashResult> => {
  const parsed = parseModelSettingsScope(arg);
  if (parsed.error) return { output: `  ${parsed.error}\n${USAGE}` };
  const intent = parseFastArg(parsed.value);
  const active = activeProviderSettings(ctx);
  const early = preflight(intent, active);
  if (early) return { output: early };

  const current = active.current.speed ?? active.capabilities.speed?.defaultValue ?? "standard";
  const next = nextFastSpeed(intent, current);

  try {
    const settings = await applyProviderSettings(ctx, { speed: next }, parsed.scope);
    const scopeNote = parsed.scope === "global" ? " · project default" : " · this session";
    return { output: fastStatusLine(settings.speed ?? next, scopeNote) };
  } catch (error) {
    return { output: `  ${error instanceof Error ? error.message : String(error)}\n${USAGE}` };
  }
};
