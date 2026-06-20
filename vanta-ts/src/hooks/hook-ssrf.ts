import { assertPublicUrl, type Resolver } from "../net/ssrf-guard.js";

// SSRF guard for http-type hooks. A hook config can POST to an arbitrary URL, so
// a malicious/compromised hooks.json could steer Vanta at cloud metadata
// (169.254.169.254), the kernel's own API (127.0.0.1:7788), or RFC-1918 LAN
// hosts. This reuses the canonical web-fetch SSRF check (assertPublicUrl: parses
// the URL, rejects non-HTTP schemes, resolves the host to its real IPs to close
// DNS-rebind, and blocks any loopback/private/link-local/metadata/unspecified
// address). Default-deny on a private target. Errors-as-values: never throws.
// Opt out for trusted self-hosted hooks with VANTA_HOOK_ALLOW_PRIVATE=1.

export type HookUrlResult = { ok: true } | { ok: false; error: string };

const ALLOW_ENV = "VANTA_HOOK_ALLOW_PRIVATE";

/** The hook SSRF guard is on unless explicitly opted out via the env flag. */
export function isHookGuardEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[ALLOW_ENV] !== "1";
}

/**
 * Reject an http-hook target URL that resolves to a non-public host. Reuses the
 * web-fetch SSRF check; blocks loopback/private/link-local/cloud-metadata IPs
 * (incl. 169.254.169.254) and malformed/non-HTTP URLs. A normal public URL is
 * allowed unchanged. VANTA_HOOK_ALLOW_PRIVATE=1 bypasses for trusted hooks.
 */
export async function assertHookUrlAllowed(
  url: string,
  opts: { resolver?: Resolver; env?: NodeJS.ProcessEnv } = {},
): Promise<HookUrlResult> {
  const env = opts.env ?? process.env;
  if (!isHookGuardEnabled(env)) return { ok: true };
  // assertPublicUrl honors VANTA_ALLOW_PRIVATE_FETCH; pass a clean env so only
  // the hook-specific opt-out (checked above) governs this gate.
  const guard = await assertPublicUrl(url, { resolver: opts.resolver, env: {} });
  if (guard.ok) return { ok: true };
  return { ok: false, error: guard.error.replace(/^SSRF guard:/, "hook SSRF guard:") };
}
