import { dirname } from "node:path";
import { providerById } from "../providers/catalog.js";
import { buildProviderForSelection, persistSelectionGlobal, parseModelArg } from "../term/model-switch.js";
import type { ModelSelection } from "../term/model-switch.js";
import type { LLMProvider } from "../providers/interface.js";
import { loadPresets, presetFor } from "../models/presets.js";
import type { SlashHandler } from "./types.js";

type ModelCtx = Parameters<SlashHandler>[1];

// `/model` — bare prints the active model; `/model <arg>` switches it. The TUI
// intercepts a bare `/model` to open the visual picker (app.tsx); the arg form
// falls through to here in BOTH surfaces. Reuses the picker's switch path
// (model-switch.ts) so typed and visual switches can't diverge: build the
// provider, hot-swap it into the live conversation AND the post-turn pipeline
// (setup.provider), reflect it in process.env, and persist to .env.
export const model: SlashHandler = async (arg, ctx) => {
  const parsedScope = parseScope(arg);
  if (parsedScope.error) return { output: `  ${parsedScope.error}` };
  const trimmed = parsedScope.arg;
  if (!trimmed) {
    if (parsedScope.explicit) return switchCurrentDefault(ctx, parsedScope.global);
    return { output: activeModelOutput(ctx) };
  }
  const currentProviderId = ctx.state.providerId ?? ctx.env.VANTA_PROVIDER ?? "openai";
  const sel = parseModelArg(trimmed, currentProviderId);
  if (!sel) {
    return { output: "  usage: /model [<provider>] [<model>] [--session|--global]   e.g. /model openai gpt-4o · /model gemini --global" };
  }
  let provider;
  try {
    provider = buildProviderForSelection(sel, ctx.env);
  } catch (err) {
    return { output: switchFailureOutput(ctx, currentProviderId, err) };
  }
  const presetNote = await applySelection(ctx, sel, provider, parsedScope.global);
  const activeProvider = provider.routeInfo?.()?.provider ?? sel.providerId;
  return { output: `  ⚓ model → ${activeProvider}/${provider.modelId()} (${sel.persistGlobal ? "set as default" : "this session"})${presetNote}`, provider };
};

function activeModelOutput(ctx: ModelCtx): string {
  const provider = ctx.setup.provider.routeInfo?.()?.provider
    ?? ctx.state.providerId
    ?? ctx.env.VANTA_PROVIDER
    ?? "openai";
  return `  ${provider}/${ctx.setup.provider.modelId()} · ${ctx.setup.provider.contextWindow().toLocaleString()} ctx`;
}

function switchFailureOutput(ctx: ModelCtx, fallbackProvider: string, err: unknown): string {
  const provider = ctx.setup.provider.routeInfo?.()?.provider ?? fallbackProvider;
  const reason = err instanceof Error ? err.message.split("\n")[0] : String(err);
  return `  ⛔ model switch failed — switch not applied; still using ${provider}/${ctx.setup.provider.modelId()}. ${reason}`;
}

async function applySelection(ctx: ModelCtx, sel: ModelSelection, provider: LLMProvider, persistGlobal: boolean): Promise<string> {
  const { buildSummarizer } = await import("../session.js");
  ctx.convo.setProvider(provider, buildSummarizer(provider));
  ctx.setup.provider = provider; // post-turn memory/review + banner read this
  sel.persistGlobal = persistGlobal;
  ctx.state.providerId = sel.providerId;
  ctx.state.modelId = provider.modelId();
  const entry = providerById(sel.providerId);
  if (sel.persistGlobal) {
    ctx.env.VANTA_PROVIDER = sel.providerId;
    ctx.env.VANTA_MODEL = sel.model;
    if (entry?.envVar && sel.apiKey) ctx.env[entry.envVar] = sel.apiKey;
    await persistSelectionGlobal(sel, dirname(ctx.dataDir)).catch(() => {});
  }
  const preset = presetFor(await loadPresets(ctx.env), provider.modelId());
  if (!preset?.effort) return "";
  ctx.state.effortLevel = preset.effort;
  ctx.setup.effortLevel = preset.effort;
  if (sel.persistGlobal) ctx.env.VANTA_EFFORT_LEVEL = preset.effort;
  return ` · effort ${preset.effort} (remembered)`;
}

function parseScope(arg: string): { arg: string; global: boolean; explicit: boolean; error?: string } {
  const tokens = arg.trim().split(/\s+/).filter(Boolean);
  const hasGlobal = tokens.includes("--global");
  const hasSession = tokens.includes("--session");
  if (hasGlobal && hasSession) return { arg: "", global: false, explicit: true, error: "choose one scope: --session or --global" };
  return { arg: tokens.filter((token) => token !== "--global" && token !== "--session").join(" "), global: hasGlobal, explicit: hasGlobal || hasSession };
}

async function switchCurrentDefault(ctx: Parameters<SlashHandler>[1], global: boolean) {
  if (!global) return { output: "  usage: /model [<provider>] [<model>] [--session|--global]" };
  const providerId = ctx.state.providerId ?? ctx.env.VANTA_PROVIDER ?? "openai";
  const sel = { providerId, model: ctx.setup.provider.modelId(), persistGlobal: true };
  ctx.env.VANTA_PROVIDER = providerId;
  ctx.env.VANTA_MODEL = sel.model;
  await persistSelectionGlobal(sel, dirname(ctx.dataDir)).catch(() => {});
  return { output: `  ⚓ ${sel.model} set as default`, provider: ctx.setup.provider };
}
