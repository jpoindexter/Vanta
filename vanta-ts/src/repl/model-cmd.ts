import { dirname } from "node:path";
import { providerById } from "../providers/catalog.js";
import { buildProviderForSelection, persistSelectionGlobal, parseModelArg } from "../tui/model-switch.js";
import type { SlashHandler } from "./types.js";

// `/model` — bare prints the active model; `/model <arg>` switches it. The TUI
// intercepts a bare `/model` to open the visual picker (app.tsx); the arg form
// falls through to here in BOTH surfaces. Reuses the picker's switch path
// (model-switch.ts) so typed and visual switches can't diverge: build the
// provider, hot-swap it into the live conversation AND the post-turn pipeline
// (setup.provider), reflect it in process.env, and persist to .env.
export const model: SlashHandler = async (arg, ctx) => {
  const trimmed = arg.trim();
  if (!trimmed) {
    return { output: `  ${ctx.setup.provider.modelId()} · ${ctx.setup.provider.contextWindow().toLocaleString()} ctx` };
  }
  const currentProviderId = ctx.env.VANTA_PROVIDER ?? "openai";
  const sel = parseModelArg(trimmed, currentProviderId);
  if (!sel) {
    return { output: "  usage: /model [<provider>] [<model>]   e.g. /model openai gpt-4o · /model gemini · /model gpt-4o-mini" };
  }
  let provider;
  try {
    provider = buildProviderForSelection(sel, ctx.env);
  } catch (err) {
    return { output: `  model switch failed: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}` };
  }
  const { buildSummarizer } = await import("../session.js");
  ctx.convo.setProvider(provider, buildSummarizer(provider));
  ctx.setup.provider = provider; // post-turn memory/review + banner read this
  ctx.env.VANTA_PROVIDER = sel.providerId;
  ctx.env.VANTA_MODEL = sel.model;
  const entry = providerById(sel.providerId);
  if (entry?.envVar && sel.apiKey) ctx.env[entry.envVar] = sel.apiKey;
  await persistSelectionGlobal(sel, dirname(ctx.dataDir)).catch(() => {});
  return { output: `  ⚓ model → ${provider.modelId()} (saved to .env)` };
};
