// VANTA-FAST-MODE — Anthropic "fast mode" (research preview): the same Opus
// weights served with a faster inference configuration at premium pricing.
//
// The wire contract is `speed: "fast"` on the Messages request PLUS the
// `fast-mode-2026-02-01` beta header. Fast mode is supported on Claude Opus 5
// and Claude Opus 4.8 only; Opus 4.7 and earlier either error or silently fall
// back to standard, so we never send `speed` for a model that does not declare
// support. Codex has its own equivalent (`service_tier: "fast"`, see codex.ts).
//
// Pure helpers only — the live API call (anthropic.ts) is the boundary.

import type { CompletionConfig } from "./interface.js";

/** Beta id that enables fast mode. Env-overridable (`VANTA_FAST_MODE_BETA`)
 *  because the id moves as the research preview graduates. */
const DEFAULT_FAST_MODE_BETA = "fast-mode-2026-02-01";

/** Model-id prefixes that support fast mode today (Anthropic docs, research
 *  preview). Prefixes so dated snapshots (`claude-opus-5-20260210`) match. */
const FAST_MODE_MODEL_PREFIXES = ["claude-opus-5", "claude-opus-4-8"] as const;

type DebugLog = (message: string) => void;

/** Extra model prefixes from `VANTA_FAST_MODE_MODELS` (comma separated), so a
 *  newly supported model works without a release. Blank entries are ignored. */
function extraPrefixes(env: NodeJS.ProcessEnv): string[] {
  return (env.VANTA_FAST_MODE_MODELS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Does this Anthropic model support fast mode? Prefix match against the
 * documented Opus models plus any env-declared additions. Case-insensitive;
 * a blank or unknown model is false (never send `speed` speculatively).
 */
export function anthropicFastModeSupported(
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const id = model.trim().toLowerCase();
  if (!id) return false;
  const prefixes = [...FAST_MODE_MODEL_PREFIXES, ...extraPrefixes(env)];
  return prefixes.some((prefix) => id === prefix || id.startsWith(`${prefix}-`));
}

/** The fast-mode beta id to send — the named constant, env-overridable via
 *  `VANTA_FAST_MODE_BETA` (trimmed; a blank override falls back). */
export function fastModeBetaHeader(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.VANTA_FAST_MODE_BETA?.trim();
  return override ? override : DEFAULT_FAST_MODE_BETA;
}

/** Is fast mode requested AND supported for this request? */
export function fastModeActive(
  model: string,
  config?: CompletionConfig,
  env: NodeJS.ProcessEnv = process.env,
  debug?: DebugLog,
): boolean {
  if (config?.serviceTier !== "fast") return false;
  if (anthropicFastModeSupported(model, env)) return true;
  debug?.(`model ${model} does not support fast mode; sending standard speed`);
  return false;
}

/**
 * The request params fast mode adds: `{ speed: "fast" }` when active, else `{}`
 * so a standard request is byte-identical to today's.
 */
export function buildAnthropicSpeedParams(
  model: string,
  config?: CompletionConfig,
  env: NodeJS.ProcessEnv = process.env,
  debug?: DebugLog,
): { speed?: "fast" } {
  return fastModeActive(model, config, env, debug) ? { speed: "fast" } : {};
}

/**
 * The betas list including the fast-mode beta when fast mode is active.
 * Preserves every existing beta, dedups, and never drops one. When fast mode is
 * not active, returns `current` deduped and otherwise unchanged.
 */
export function withFastModeBeta(
  current: string[],
  fastActive: boolean,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const betas = fastActive ? [...current, fastModeBetaHeader(env)] : [...current];
  return [...new Set(betas)];
}
