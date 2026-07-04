import { resolveProvider } from "../providers/index.js";
import type { LLMProvider } from "../providers/interface.js";

// WEB-EXTRACT-AUX-MODEL — web_extract summarization is an AUXILIARY task, same
// shape as vision.ts: it can run on a separate (often cheaper) model than the one
// the operator is conversing with, so a big-page digest doesn't burn the
// expensive main model on every fetch. Model/provider swap is opt-in (unset =
// active provider, byte-identical). The request TIMEOUT is independent by
// default (Hermes' documented 360s) regardless of model swap — a big-page
// summarize call deserves its own budget, not whatever VANTA_PROVIDER_TIMEOUT_SEC
// happens to be tuned to for snappy interactive chat.

/** Hermes' documented default timeout for extraction summarization (seconds). */
export const DEFAULT_EXTRACT_TIMEOUT_SEC = 360;

/**
 * Pure: the env that web_extract summarization should resolve its provider from.
 *   VANTA_EXTRACT_MODEL set    → swap VANTA_MODEL to it (and VANTA_PROVIDER too when
 *                                VANTA_EXTRACT_PROVIDER is set, for a model on a
 *                                different backend).
 *   VANTA_EXTRACT_MODEL unset  → model/provider unchanged — extraction uses the
 *                                active provider (opt-in override).
 * Always sets VANTA_PROVIDER_TIMEOUT_SEC to VANTA_EXTRACT_TIMEOUT_SEC (default
 * 360s) — resolveProviderTimeoutMs reads it at provider-construction time, so
 * this is the only override extraction's independent timeout needs. Never
 * mutates the input.
 */
export function extractEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const model = env.VANTA_EXTRACT_MODEL;
  const next: NodeJS.ProcessEnv = { ...env };
  if (model) {
    next.VANTA_MODEL = model;
    if (env.VANTA_EXTRACT_PROVIDER) next.VANTA_PROVIDER = env.VANTA_EXTRACT_PROVIDER;
  }
  next.VANTA_PROVIDER_TIMEOUT_SEC = env.VANTA_EXTRACT_TIMEOUT_SEC ?? String(DEFAULT_EXTRACT_TIMEOUT_SEC);
  return next;
}

/**
 * Resolve the provider for web_extract summarization. See {@link extractEnv} for
 * the routing rule. Use this — not `resolveProvider` directly — so a cheap aux
 * model can be configured for big-page digests independent of the main model.
 */
export function resolveExtractProvider(env: NodeJS.ProcessEnv): LLMProvider {
  return resolveProvider(extractEnv(env));
}
