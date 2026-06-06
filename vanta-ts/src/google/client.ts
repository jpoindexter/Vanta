import { getAccessToken } from "./auth.js";

/**
 * Authenticated fetch wrapper for Google REST APIs. Attaches a Bearer token
 * and retries exactly once on a 401 (forcing auth.js's refresh path). Returns
 * the raw Response — callers read non-2xx bodies themselves; only network
 * failures throw.
 */
export async function googleFetch(
  url: string,
  init: RequestInit = {},
  env?: NodeJS.ProcessEnv,
): Promise<Response> {
  const token = await getAccessToken(env);
  const res = await fetch(url, withAuth(init, token));
  if (res.status !== 401) return res;
  // 401: token may be stale. getAccessToken again to take the refresh path,
  // then retry exactly once. No further retry — avoid an auth loop.
  const fresh = await getAccessToken(env);
  return fetch(url, withAuth(init, fresh));
}

/** Merge a Bearer token into init.headers without clobbering existing headers. */
function withAuth(init: RequestInit, token: string): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * Append defined params to a base URL as an encoded query string. Skips
 * undefined values; returns the base unchanged when no params remain.
 */
export function buildUrl(
  base: string,
  params?: Record<string, string | number | undefined>,
): string {
  if (!params) return base;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}
