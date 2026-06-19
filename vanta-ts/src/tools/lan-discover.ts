import { networkInterfaces } from "node:os";
import { z } from "zod";
import type { Tool } from "./types.js";
import { isPrivateIpv4, scanSubnet, formatDevices } from "../reach/lan-scan.js";
import { liveProber } from "../reach/lan-probe.js";

const Args = z.object({
  /** A /24 subnet base like "192.168.1"; auto-detected from the host if omitted. */
  subnet: z.string().min(1).optional(),
  timeoutMs: z.number().int().min(50).max(5000).optional(),
});

/** Derive the local /24 base ("192.168.1") from the first private IPv4 NIC. Pure-ish (reads OS). */
export function detectSubnetBase(
  ifaces: ReturnType<typeof networkInterfaces> = networkInterfaces(),
): string | null {
  for (const addrs of Object.values(ifaces)) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal && isPrivateIpv4(a.address)) {
        return a.address.split(".").slice(0, 3).join(".");
      }
    }
  }
  return null;
}

export const lanDiscoverTool: Tool = {
  schema: {
    name: "lan_discover",
    description:
      "Read-only scan of the local network (/24 subnet) to find smart-home / LAN devices " +
      "(Sonos, lights, HVAC, cameras, media players) and their likely local HTTP API endpoints. " +
      "Strictly local: refuses any non-private subnet. Auto-detects your subnet if not given. " +
      "No device is touched beyond a GET probe; use lan_control to actually drive a device.",
    parameters: {
      type: "object",
      properties: {
        subnet: { type: "string", description: 'A /24 base like "192.168.1" (auto-detected if omitted)' },
        timeoutMs: { type: "integer", minimum: 50, maximum: 5000, description: "Per-host probe timeout (default 800)" },
      },
      required: [],
    },
  },
  // Read-only probe → kernel Allow.
  describeForSafety: (a) => `read-only lan discovery scan of subnet ${String(a.subnet ?? "auto")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'lan_discover: optional "subnet" (e.g. "192.168.1") and "timeoutMs"' };
    const base = parsed.data.subnet ?? detectSubnetBase();
    if (!base) {
      return { ok: false, output: "lan_discover: could not detect a private subnet; pass one, e.g. {subnet:\"192.168.1\"}" };
    }
    const r = await scanSubnet({ base: base.split(".").slice(0, 3).join("."), prober: liveProber, timeoutMs: parsed.data.timeoutMs });
    if (!r.ok) return { ok: false, output: `lan_discover failed: ${r.error}` };
    return { ok: true, output: formatDevices(base, r.devices) };
  },
};
