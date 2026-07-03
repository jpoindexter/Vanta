// WEB-DOMAIN-SCOPING — pure helpers for allowed/excluded-domain search scoping.
// Replaces the ad-hoc `site:x.com` query hacks agents hand-roll: a first-class
// scope is validated once, then either passed to a native-filtering provider or
// rewritten into the query with site:/-site: for providers without native support.

/** Max domains per scope list — bounds a query rewrite from ballooning. */
export const MAX_SCOPE_DOMAINS = 10;

export type DomainScope = { allowedDomains?: string[]; excludedDomains?: string[] };

/** Bare host: strip scheme, path, and case so "https://X.com/p" → "x.com". */
function normDomain(d: string): string {
  return d.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
}

/**
 * Validate a domain scope: allowed and excluded are mutually exclusive, the list
 * is capped at {@link MAX_SCOPE_DOMAINS}, and no entry is blank. Returns an
 * actionable error string, or null when the scope is valid (incl. empty).
 */
export function validateDomainScope(scope: DomainScope): string | null {
  const allowed = scope.allowedDomains ?? [];
  const excluded = scope.excludedDomains ?? [];
  if (allowed.length && excluded.length) {
    return "web_search: allowed_domains and excluded_domains are mutually exclusive — pass only one.";
  }
  const list = allowed.length ? allowed : excluded;
  if (list.length > MAX_SCOPE_DOMAINS) {
    return `web_search: at most ${MAX_SCOPE_DOMAINS} domains per search (got ${list.length}).`;
  }
  if (list.some((d) => !normDomain(d))) {
    return 'web_search: domain entries must be non-empty hosts (e.g. "example.com").';
  }
  return null;
}

/** True when the scope actually constrains anything (either list non-empty). */
export function hasDomainScope(scope: DomainScope): boolean {
  return Boolean(scope.allowedDomains?.length || scope.excludedDomains?.length);
}

/**
 * Rewrite a query with site:/-site: filters for providers WITHOUT native domain
 * support. allowed → `q (site:a OR site:b)`; excluded → `q -site:a -site:b`.
 * Returns the query unchanged when the scope is empty.
 */
export function scopeQuery(query: string, scope: DomainScope): string {
  const allowed = (scope.allowedDomains ?? []).map(normDomain).filter(Boolean);
  const excluded = (scope.excludedDomains ?? []).map(normDomain).filter(Boolean);
  if (allowed.length) {
    const clause = allowed.length === 1 ? `site:${allowed[0]}` : `(${allowed.map((d) => `site:${d}`).join(" OR ")})`;
    return `${query} ${clause}`;
  }
  if (excluded.length) {
    return `${query} ${excluded.map((d) => `-site:${d}`).join(" ")}`;
  }
  return query;
}
