// LAN device discovery — the "Dobby" home-operator core.
//
// Pure, IO-injected scanning + fingerprinting so the network is mockable in
// tests. Discovery is strictly READ-ONLY and bounded to the local subnet; it
// never reaches outside the LAN. Control (mutating HTTP calls) lives in the
// tool layer behind an approval gate — this module only IDENTIFIES devices and
// their likely local API endpoints.

/** A single port to probe, with the device class it hints at. */
export type PortHint = { port: number; scheme: "http" | "https"; kind: string };

/** Common smart-home / LAN service ports and what they usually mean. */
export const DEFAULT_PORT_HINTS: readonly PortHint[] = [
  { port: 80, scheme: "http", kind: "http-device" },
  { port: 443, scheme: "https", kind: "https-device" },
  { port: 1400, scheme: "http", kind: "sonos" },
  { port: 8008, scheme: "http", kind: "chromecast" },
  { port: 8009, scheme: "http", kind: "chromecast" },
  { port: 8060, scheme: "http", kind: "roku" },
  { port: 9123, scheme: "http", kind: "esphome" },
  { port: 80, scheme: "http", kind: "hue-bridge" },
];

/** Result of probing one host:port. `ok` = something answered. */
export type ProbeResult = {
  host: string;
  port: number;
  scheme: "http" | "https";
  ok: boolean;
  status?: number;
  /** Identifying header/body snippet (e.g. Server header) — never secrets. */
  banner?: string;
};

/** A probe function the tool injects; tests pass a fake (no real network). */
export type HostProber = (
  host: string,
  hint: PortHint,
  timeoutMs: number,
) => Promise<ProbeResult>;

export type DiscoveredEndpoint = {
  url: string;
  kind: string;
  status?: number;
  banner?: string;
};

export type DiscoveredDevice = {
  host: string;
  /** Best guess at the device class from the responding ports/banners. */
  guess: string;
  endpoints: DiscoveredEndpoint[];
};

const PRIVATE_PREFIXES = ["10.", "192.168.", "127."];

/** True only for RFC-1918 / loopback IPv4 (also 172.16–172.31). Pure. */
export function isPrivateIpv4(ip: string): boolean {
  if (PRIVATE_PREFIXES.some((p) => ip.startsWith(p))) return true;
  const m = /^172\.(\d{1,3})\./.exec(ip);
  if (!m) return false;
  const second = Number(m[1]);
  return second >= 16 && second <= 31;
}

/**
 * Expand a /24 subnet base (e.g. "192.168.1") into host IPs .1–.254. Refuses
 * non-private bases so a scan can never leave the LAN. Returns an error value
 * rather than throwing.
 */
export function hostsForSubnet24(
  base: string,
): { ok: true; hosts: string[] } | { ok: false; error: string } {
  const trimmed = base.trim().replace(/\.$/, "");
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
    return { ok: false, error: `subnet base must be three octets like "192.168.1", got "${base}"` };
  }
  if (!isPrivateIpv4(`${trimmed}.1`)) {
    return { ok: false, error: `refusing to scan non-private subnet "${trimmed}.0/24" (LAN only)` };
  }
  const hosts: string[] = [];
  for (let i = 1; i <= 254; i++) hosts.push(`${trimmed}.${i}`);
  return { ok: true, hosts };
}

/** Pick the device class from the responding hints (most-specific wins). */
function guessDevice(endpoints: DiscoveredEndpoint[]): string {
  const specific = endpoints.find((e) => !e.kind.endsWith("-device"));
  return specific?.kind ?? endpoints[0]?.kind ?? "unknown";
}

/** Fold per-host probe results into one device record (only responders). Pure. */
export function devicesFromProbes(results: ProbeResult[]): DiscoveredDevice[] {
  const byHost = new Map<string, DiscoveredEndpoint[]>();
  for (const r of results) {
    if (!r.ok) continue;
    const list = byHost.get(r.host) ?? [];
    list.push({ url: `${r.scheme}://${r.host}:${r.port}`, kind: hintKind(r), status: r.status, banner: r.banner });
    byHost.set(r.host, list);
  }
  return [...byHost.entries()].map(([host, endpoints]) => ({ host, guess: guessDevice(endpoints), endpoints }));
}

function hintKind(r: ProbeResult): string {
  const hint = DEFAULT_PORT_HINTS.find((h) => h.port === r.port && h.scheme === r.scheme);
  return hint?.kind ?? "http-device";
}

export type ScanOptions = {
  base: string;
  prober: HostProber;
  timeoutMs?: number;
  hints?: readonly PortHint[];
  concurrency?: number;
};

const DEFAULT_TIMEOUT_MS = 800;
const DEFAULT_CONCURRENCY = 64;

/**
 * Scan a /24 LAN subnet read-only and return discovered devices. The actual
 * network IO is the injected `prober` — tests mock it, so no real packets fly.
 */
export async function scanSubnet(
  opts: ScanOptions,
): Promise<{ ok: true; devices: DiscoveredDevice[] } | { ok: false; error: string }> {
  const expanded = hostsForSubnet24(opts.base);
  if (!expanded.ok) return expanded;
  const hints = opts.hints ?? DEFAULT_PORT_HINTS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const jobs: Array<{ host: string; hint: PortHint }> = [];
  for (const host of expanded.hosts) for (const hint of hints) jobs.push({ host, hint });
  const results = await runPool(jobs, opts.concurrency ?? DEFAULT_CONCURRENCY, (j) =>
    opts.prober(j.host, j.hint, timeoutMs),
  );
  return { ok: true, devices: devicesFromProbes(results) };
}

/** Bounded-concurrency map over jobs. Pure aside from the injected worker. */
async function runPool<T, R>(jobs: T[], limit: number, worker: (j: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(jobs.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, jobs.length || 1) }, async () => {
    for (let i = next++; i < jobs.length; i = next++) out[i] = await worker(jobs[i]!);
  });
  await Promise.all(lanes);
  return out;
}

/** Format the device list for the model (compact, source-grounded). Pure. */
export function formatDevices(base: string, devices: DiscoveredDevice[]): string {
  if (devices.length === 0) return `LAN scan of ${base}.0/24: no responding devices found.`;
  const rows = devices.map((d) => {
    const eps = d.endpoints.map((e) => `${e.url}${e.banner ? ` (${e.banner})` : ""}`).join(", ");
    return `- ${d.host} [${d.guess}] → ${eps}`;
  });
  return [`LAN scan of ${base}.0/24 — ${devices.length} device(s):`, ...rows].join("\n");
}
