// VANTA-INTERLEAVED-THINKING — opt the Anthropic request into interleaved
// thinking (the beta that lets Claude think BETWEEN tool calls, not only
// before the first response) whenever extended thinking is active.
//
// Pure helpers only — the live API call (anthropic.ts) is the boundary.

import { modelSupports } from "./catalog.js";

/** Anthropic beta id that enables interleaved thinking. Env-overridable
 *  (`VANTA_INTERLEAVED_BETA`) because the beta id may change as the feature
 *  graduates — the live header is the documented boundary. */
const DEFAULT_INTERLEAVED_BETA = "interleaved-thinking-2025-05-14";

const DISABLE_VALUES = new Set(["0", "false", "no", "off"]);

export type InterleavedOpts = {
  /** The Anthropic model id (e.g. `claude-sonnet-4-6`). */
  model: string;
  /** Whether extended thinking is active on this request. */
  thinkingActive: boolean;
};

/** Is `VANTA_INTERLEAVED_THINKING` set to an explicit disable value?
 *  Default (unset / any other value) is enabled — interleaved thinking is
 *  on whenever thinking is on, matching Anthropic's tool-use recommendation. */
function isDisabled(env: NodeJS.ProcessEnv): boolean {
  const v = env.VANTA_INTERLEAVED_THINKING?.trim().toLowerCase();
  return v !== undefined && DISABLE_VALUES.has(v);
}

/**
 * Should this request opt into interleaved thinking?
 * True iff extended thinking is active, the model supports thinking, and the
 * env does not explicitly disable it. Off / non-thinking / non-Anthropic-
 * thinking models all return false → no change to the request.
 */
export function wantsInterleavedThinking(
  opts: InterleavedOpts,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!opts.thinkingActive) return false;
  if (!modelSupports(opts.model, "thinking")) return false;
  return !isDisabled(env);
}

/** The interleaved beta id to send — the named constant, env-overridable
 *  via `VANTA_INTERLEAVED_BETA` (trimmed; blank override falls back). */
export function interleavedBetaHeader(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.VANTA_INTERLEAVED_BETA?.trim();
  return override ? override : DEFAULT_INTERLEAVED_BETA;
}

/**
 * The betas list including the interleaved beta when wanted. Preserves every
 * existing beta, dedups, and never drops one. When interleaved thinking is not
 * wanted, returns `current` unchanged (deduped).
 */
export function buildAnthropicBetas(
  current: string[],
  opts: InterleavedOpts,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const out = [...current];
  if (wantsInterleavedThinking(opts, env)) out.push(interleavedBetaHeader(env));
  return [...new Set(out)];
}
