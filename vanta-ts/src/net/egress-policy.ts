import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

// NET-EGRESS-POLICY — an allow/deny list over outbound network destinations, on
// top of the private-IP/metadata block (net/ssrf-guard.ts). One policy, applied
// in assertPublicUrl, so every outbound path (web_fetch, browser, MCP, hooks,
// reach) inherits it. Deny wins; an allowlist (when set) is default-deny for
// anything unlisted — "safe for strangers". Denied attempts are logged. Pure
// matching + parse; the log is a best-effort side effect.

export type EgressPolicy = { allow: string[]; deny: string[] };
export type EgressDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * Does `host` match a domain pattern? `*.x.com` matches sub-domains only;
 * a bare `x.com` matches the apex AND any sub-domain. Case-insensitive. Pure.
 */
export function domainMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase().trim();
  if (!p) return false;
  const base = p.startsWith("*.") ? p.slice(2) : p;
  return h === base || h.endsWith(`.${base}`);
}

const list = (v: string | undefined): string[] =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Read the allow/deny lists from env (VANTA_EGRESS_ALLOW / VANTA_EGRESS_DENY). Pure. */
export function parseEgressPolicy(env: NodeJS.ProcessEnv = process.env): EgressPolicy {
  return { allow: list(env.VANTA_EGRESS_ALLOW), deny: list(env.VANTA_EGRESS_DENY) };
}

/**
 * Apply the policy to a host. Deny list wins; if an allow list is set, anything
 * not on it is denied (allowlist = default-deny). Empty policy → allowed. Pure.
 */
export function checkEgressPolicy(host: string, policy: EgressPolicy): EgressDecision {
  if (policy.deny.some((p) => domainMatches(host, p))) {
    return { allowed: false, reason: `egress denied: ${host} matches the deny list` };
  }
  if (policy.allow.length > 0 && !policy.allow.some((p) => domainMatches(host, p))) {
    return { allowed: false, reason: `egress denied: ${host} is not in the allow list` };
  }
  return { allowed: true };
}

/** Best-effort: record a denied egress attempt to ~/.vanta/egress-denied.log + stderr. */
export async function logEgressDenial(host: string, reason: string): Promise<void> {
  try {
    process.stderr.write(`[vanta] ${reason}\n`);
    const dir = resolveVantaHome();
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, "egress-denied.log"), `${new Date().toISOString()}\t${host}\t${reason}\n`);
  } catch {
    /* logging is best-effort; never let it break the guard */
  }
}
