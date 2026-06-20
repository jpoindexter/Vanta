// Pure network-deny policy: a deniedDomains list blocks specific hosts even when
// a broader allowlist/allow-mode would permit them. Deny ALWAYS wins over allow
// (default-deny posture — a denied domain is never reachable). An empty deny list
// is a no-op, so callers fall back to their existing allow decision unchanged.
//
// Domain matching mirrors browser/allowlist.ts: a host matches a deny entry when
// it is EXACTLY that domain or a subdomain of it (foo.example.com vs example.com).

/** Normalize a host/domain for matching: lowercased, trimmed, no trailing dot. */
function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

/**
 * Whether `host` is exactly, or a subdomain of, any entry in `deniedDomains`.
 * Pure. Empty/whitespace entries are ignored; an empty list returns false
 * (nothing denied). Matching is case-insensitive and subdomain-aware:
 * `api.example.com` matches a `example.com` deny entry; `notexample.com` does NOT.
 */
export function isDomainDenied(host: string, deniedDomains: string[]): boolean {
  const target = normalizeHost(host);
  if (target.length === 0) return false;

  const denied = deniedDomains
    .map(normalizeHost)
    .filter((d) => d.length > 0);
  if (denied.length === 0) return false;

  return denied.some((d) => target === d || target.endsWith(`.${d}`));
}

/** Inputs to the per-host network decision. */
export interface NetworkPolicy {
  /** Whether the broader allowlist/allow-mode would otherwise permit the host. */
  allow: boolean;
  /** Hosts blocked even when `allow` is true. Deny wins. */
  deniedDomains: string[];
}

export type NetworkDecision = "allow" | "deny";

/**
 * Resolve the per-host network decision. A denied domain is ALWAYS "deny" even
 * when `allow` is true (deny-wins). Otherwise the decision follows `allow`. With
 * an empty deny list this reduces to `allow ? "allow" : "deny"` (current behavior).
 */
export function networkDecision(host: string, policy: NetworkPolicy): NetworkDecision {
  if (isDomainDenied(host, policy.deniedDomains)) return "deny";
  return policy.allow ? "allow" : "deny";
}
