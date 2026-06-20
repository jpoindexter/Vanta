import type { Settings } from "../settings/store.js";

/** Env var that bypasses the web-fetch preflight/domain safety check. */
export const SKIP_WEBFETCH_PREFLIGHT_ENV = "VANTA_SKIP_WEBFETCH_PREFLIGHT";

/** Values an env override may use to mean "on". Anything else (incl. unset) = off. */
const TRUTHY = new Set(["1", "true", "yes", "on"]);

function envTruthy(value: string | undefined): boolean {
  return value !== undefined && TRUTHY.has(value.trim().toLowerCase());
}

/**
 * Decide whether web-fetch should SKIP its preflight/domain safety check
 * (the SSRF guard that re-validates every URL hop before fetching it).
 *
 * Pure. Default = false (preflight ON — the current, safe behavior). True only
 * when the operator opts in via `settings.skipWebFetchPreflight` OR the
 * `VANTA_SKIP_WEBFETCH_PREFLIGHT` env override. The env override exists so a
 * trusted launch can bypass without editing settings.json.
 */
export function shouldSkipPreflight(
  settings: Settings,
  env: NodeJS.ProcessEnv,
): boolean {
  if (settings.skipWebFetchPreflight === true) return true;
  return envTruthy(env[SKIP_WEBFETCH_PREFLIGHT_ENV]);
}
