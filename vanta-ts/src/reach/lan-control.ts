// LAN device control core — builds/validates a mutating HTTP request to a
// discovered local device, and performs it via an injectable sender (tests
// mock the network). The TOOL gates every call behind kernel Ask + an explicit
// human approval; this module just enforces the LAN-only invariant and shapes
// the request. Pure aside from the injected sender.

import { isPrivateIpv4 } from "./lan-scan.js";

export type ControlRequest = {
  url: string;
  method: "POST" | "PUT" | "GET";
  body?: string;
  contentType?: string;
};

export type ControlResult = { status: number; bodySnippet: string };
export type ControlSender = (req: ControlRequest, timeoutMs: number) => Promise<ControlResult>;

/** Extract the host from an http(s) URL, or null when malformed. Pure. */
export function hostFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname;
  } catch {
    return null;
  }
}

/**
 * Validate a control request stays on the LAN (private IPv4 host only) before
 * it is ever sent. Returns an error value, never throws. This is the safety
 * floor that mirrors discovery's LAN-only bound for the mutating path.
 */
export function checkLanTarget(url: string): { ok: true; host: string } | { ok: false; error: string } {
  const host = hostFromUrl(url);
  if (!host) return { ok: false, error: `not a valid http(s) URL: "${url}"` };
  if (!isPrivateIpv4(host)) {
    return { ok: false, error: `refusing to control non-LAN host "${host}" (private IPv4 only)` };
  }
  return { ok: true, host };
}

/** A short, human-readable description of the control action for the approval prompt. Pure. */
export function describeControl(req: ControlRequest): string {
  return `${req.method} ${req.url}${req.body ? ` (${req.body.length}-byte body)` : ""}`;
}

/**
 * Perform a validated LAN control request via the injected sender. Refuses
 * non-LAN targets first; sender failures resolve to an error value.
 */
export async function sendControl(
  req: ControlRequest,
  send: ControlSender,
  timeoutMs: number,
): Promise<{ ok: true; result: ControlResult } | { ok: false; error: string }> {
  const guard = checkLanTarget(req.url);
  if (!guard.ok) return guard;
  try {
    const result = await send(req, timeoutMs);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
