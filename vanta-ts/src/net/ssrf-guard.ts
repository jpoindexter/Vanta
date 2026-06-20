import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isBlockedIp } from "./ip-ranges.js";

// SSRF GUARD — bounds every outbound fetch of an arbitrary/remote URL so the
// agent can't be steered at cloud metadata (169.254.169.254), the kernel's own
// API (127.0.0.1:7788), or RFC-1918 LAN hosts. assertPublicUrl resolves the
// host to its actual IPs (closing DNS-rebind) and rejects any private target.
// Errors-as-values: never throws across the tool boundary. Opt out per-call
// with VANTA_ALLOW_PRIVATE_FETCH=1 (deliberate LAN access); default = guard ON.

export { isBlockedIp };

export type GuardResult = { ok: true } | { ok: false; error: string };

const ALLOW_ENV = "VANTA_ALLOW_PRIVATE_FETCH";

/** Resolve a hostname to all its IP addresses. Injected so tests stay offline. */
export type Resolver = (host: string) => Promise<string[]>;

const defaultResolver: Resolver = async (host) => {
  const records = await lookup(host, { all: true });
  return records.map((r) => r.address);
};

/** The private-fetch guard is on unless explicitly opted out via the env flag. */
export function isGuardEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[ALLOW_ENV] !== "1";
}

function blocked(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** Parse + scheme-check a URL, returning the bare hostname (brackets stripped). */
function parseHost(url: string): { ok: true; host: string } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return blocked(`SSRF guard: not a valid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return blocked(`SSRF guard: scheme not allowed: ${parsed.protocol}`);
  }
  return { ok: true, host: parsed.hostname.replace(/^\[|\]$/g, "") };
}

/** Resolve a hostname and block if any returned address is in a private range. */
async function checkResolvedHost(host: string, resolver: Resolver): Promise<GuardResult> {
  let addresses: string[];
  try {
    addresses = await resolver(host);
  } catch (err) {
    return blocked(`SSRF guard: cannot resolve host ${host}: ${(err as Error).message}`);
  }
  if (addresses.length === 0) return blocked(`SSRF guard: host ${host} resolved to no addresses`);
  const bad = addresses.find((addr) => isBlockedIp(addr));
  return bad ? blocked(`SSRF guard: ${host} resolves to private address ${bad}`) : { ok: true };
}

/**
 * Reject a URL that targets a non-public host. Parses the URL, rejects non-HTTP
 * schemes, and — for both literal-IP hosts and resolved hostnames — rejects any
 * loopback/private/link-local/metadata/unspecified address. Returns a
 * GuardResult (errors-as-values); honors VANTA_ALLOW_PRIVATE_FETCH=1.
 */
export async function assertPublicUrl(
  url: string,
  opts: { resolver?: Resolver; env?: NodeJS.ProcessEnv } = {},
): Promise<GuardResult> {
  if (!isGuardEnabled(opts.env ?? process.env)) return { ok: true };
  const parsed = parseHost(url);
  if (!parsed.ok) return parsed;
  const { host } = parsed;
  if (isIP(host)) {
    return isBlockedIp(host)
      ? blocked(`SSRF guard: blocked private/loopback address: ${host}`)
      : { ok: true };
  }
  return checkResolvedHost(host, opts.resolver ?? defaultResolver);
}
