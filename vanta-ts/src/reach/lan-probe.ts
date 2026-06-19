// The LIVE LAN prober: the one place that touches the network for discovery.
// Read-only HTTP GET with a short timeout. Kept separate from lan-scan.ts so
// the scan/fingerprint core stays pure and tests inject a fake prober.

import type { HostProber, ProbeResult, PortHint } from "./lan-scan.js";

/** Snip a Server-ish banner without ever capturing secrets/cookies. */
function bannerFromHeaders(headers: Headers): string | undefined {
  const server = headers.get("server");
  const usn = headers.get("application-url") ?? headers.get("x-sonos-household");
  const raw = server ?? usn;
  return raw ? raw.slice(0, 80) : undefined;
}

/**
 * Probe one host:port with a GET and a hard timeout. Any answer (even an error
 * status) counts as "something is there". Network failures resolve to ok:false
 * — never throw across the boundary.
 */
export const liveProber: HostProber = async (
  host: string,
  hint: PortHint,
  timeoutMs: number,
): Promise<ProbeResult> => {
  const url = `${hint.scheme}://${host}:${hint.port}/`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", signal: ac.signal, redirect: "manual" });
    return {
      host,
      port: hint.port,
      scheme: hint.scheme,
      ok: true,
      status: res.status,
      banner: bannerFromHeaders(res.headers),
    };
  } catch {
    return { host, port: hint.port, scheme: hint.scheme, ok: false };
  } finally {
    clearTimeout(timer);
  }
};
