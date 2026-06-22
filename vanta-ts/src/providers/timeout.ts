// PROVIDER-AWARE-WATCHDOG — one source of truth for the active provider's
// model-call request timeout, cold-start aware. The provider SDK client and the
// liveness watchdog both derive their window from this, so a watchdog can never
// fire before the provider's own configured timeout could even elapse — the
// "spurious cold-start timeout → cron double-run" bug class becomes structurally
// impossible instead of a tuning accident.

/** SDK-default request timeout (OpenAI node SDK = 10 min, verified in node_modules).
 *  Our default matches it exactly, so setting the timeout explicitly is a no-op at
 *  defaults — no provider gets a tighter window than it had before. */
export const DEFAULT_PROVIDER_TIMEOUT_SEC = 600;

/** Providers whose first call after idle is cold-start-slow (model load / spin-up):
 *  a local model or a serverless endpoint can take far longer to return the first
 *  token than a warm hosted API. They get a longer default so neither the SDK nor
 *  the watchdog aborts a legitimately-slow cold start (the reported DeepSeek case). */
export const COLD_START_PROVIDER_TIMEOUT_SEC: Record<string, number> = {
  ollama: 1800, // local model load + inference on CPU/MPS can run to minutes
  lmstudio: 1800,
  custom: 1200, // unknown self-hosted endpoint — be generous
  deepseek: 900, // hosted but documented slow cold starts (the reported case)
  nim: 900,
  nvidia: 900,
};

/** Headroom added on top of the provider timeout before the liveness watchdog may
 *  consider a run stalled, so a call legitimately near its own timeout is never
 *  pre-empted as "stuck". */
export const WATCHDOG_COLD_START_MARGIN_SEC = 120;

/** Parse a positive integer from an env string, or null if absent/invalid. */
function positiveInt(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** The active provider id (lowercased), defaulting to openai — mirrors resolveProvider. */
export function activeProviderId(env: NodeJS.ProcessEnv): string {
  return (env.VANTA_PROVIDER ?? "openai").toLowerCase();
}

/**
 * The configured model-call request timeout for the active provider, in seconds.
 * Precedence: explicit `VANTA_PROVIDER_TIMEOUT_SEC` > per-provider cold-start
 * default > global default (which equals the SDK default → no regression).
 */
export function resolveProviderTimeoutSec(env: NodeJS.ProcessEnv): number {
  const override = positiveInt(env.VANTA_PROVIDER_TIMEOUT_SEC);
  if (override !== null) return override;
  return COLD_START_PROVIDER_TIMEOUT_SEC[activeProviderId(env)] ?? DEFAULT_PROVIDER_TIMEOUT_SEC;
}

/** Same, in milliseconds — the unit the SDK `timeout` option expects. */
export function resolveProviderTimeoutMs(env: NodeJS.ProcessEnv): number {
  return resolveProviderTimeoutSec(env) * 1000;
}

/**
 * The liveness-watchdog stall window (minutes), derived so it NEVER trips before
 * the active provider's configured timeout + cold-start margin. Returns the larger
 * of the operator's stall floor and the provider-derived minimum: a generous
 * `VANTA_WATCHDOG_STALL_MIN` is honored, but a too-tight one is clamped up so it
 * cannot false-fire on a cold provider.
 */
export function watchdogStallMinutes(env: NodeJS.ProcessEnv, floorMinutes: number): number {
  const providerWindowMin = (resolveProviderTimeoutSec(env) + WATCHDOG_COLD_START_MARGIN_SEC) / 60;
  return Math.max(floorMinutes, Math.ceil(providerWindowMin));
}
