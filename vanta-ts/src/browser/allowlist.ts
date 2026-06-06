/**
 * Parse a URL and return its lowercased hostname, or null when the URL is
 * unparseable. Uses the global URL class (no deps).
 */
export function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Whether `url`'s domain is exactly, or a subdomain of, any host listed in
 * VANTA_ALLOWED_DOMAINS (comma-separated). A missing/empty list pre-approves
 * nothing, so this returns false — callers must opt domains in explicitly.
 */
export function isAllowedDomain(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const domain = extractDomain(url);
  if (domain === null) return false;

  const allowed = (env.VANTA_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
  if (allowed.length === 0) return false;

  return allowed.some(
    (host) => domain === host || domain.endsWith(`.${host}`),
  );
}
