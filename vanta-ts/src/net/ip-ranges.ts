import { isIP } from "node:net";

// SSRF blocklist primitives — pure IP-range classification, no I/O.
// Splitting the literal-IP test out of ssrf-guard.ts keeps both files small and
// lets the range logic be unit-tested in isolation with literal addresses.

const IPV4_MAPPED = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

/** Parse a dotted-quad IPv4 string into its 32-bit unsigned integer. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    acc = acc * 256 + n;
  }
  return acc >>> 0;
}

/** True if the IPv4 integer falls inside `base/prefix` (e.g. 10.0.0.0/8). */
function inV4Cidr(value: number, base: string, prefix: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (baseInt & mask);
}

/** Loopback / private / link-local / metadata / unspecified IPv4 ranges. */
function isBlockedV4(ip: string): boolean {
  const v = ipv4ToInt(ip);
  if (v === null) return false;
  return (
    inV4Cidr(v, "0.0.0.0", 8) || // "this network" / unspecified
    inV4Cidr(v, "10.0.0.0", 8) || // RFC1918 private
    inV4Cidr(v, "127.0.0.0", 8) || // loopback
    inV4Cidr(v, "169.254.0.0", 16) || // link-local incl. 169.254.169.254 metadata
    inV4Cidr(v, "172.16.0.0", 12) || // RFC1918 private
    inV4Cidr(v, "192.168.0.0", 16) // RFC1918 private
  );
}

/** Loopback / unspecified / unique-local / link-local IPv6 ranges. */
function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  const head = lower.split("%")[0] ?? lower; // strip zone id (fe80::1%en0)
  if (/^fe[89ab]/.test(head)) return true; // fe80::/10 link-local
  return /^f[cd]/.test(head); // fc00::/7 unique-local
}

/**
 * True if a literal IP string sits in any SSRF-dangerous range (loopback,
 * private, link-local/metadata, or unspecified). Pure — accepts literal IPs
 * only; non-IP input returns false (callers reject by hostname resolution).
 * Handles IPv4-mapped IPv6 (`::ffff:127.0.0.1`) by testing the embedded IPv4.
 */
export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedV4(ip);
  if (kind === 6) {
    const mapped = IPV4_MAPPED.exec(ip);
    if (mapped) return isBlockedV4(mapped[1] ?? "");
    return isBlockedV6(ip);
  }
  return false;
}
