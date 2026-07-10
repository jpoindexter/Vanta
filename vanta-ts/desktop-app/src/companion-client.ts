import { Capacitor } from "@capacitor/core";
import type { EventRow } from "./types.js";

export const TOKEN_KEY = "vanta.companion.token.v1";
export const HOST_KEY = "vanta.companion.host.v1";

export function isNativeCompanion(): boolean { return Capacitor.isNativePlatform(); }

export function normalizeHost(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function companionClient(token: string, host = "") {
  return async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(`${normalizeHost(host)}/api/companion${path}`, { ...init, headers });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "request failed");
    return body as T;
  };
}

export async function streamCompanionEvents(opts: {
  token: string; host: string; signal: AbortSignal; onEvent: (event: EventRow & { delta?: string }) => void;
}): Promise<void> {
  const response = await fetch(`${normalizeHost(opts.host)}/api/companion/events`, {
    headers: { authorization: `Bearer ${opts.token}` }, signal: opts.signal,
  });
  if (!response.ok || !response.body) throw new Error("event stream unavailable");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  while (!opts.signal.aborted) {
    const chunk = await reader.read();
    if (chunk.done) return;
    pending += chunk.value;
    const frames = pending.split("\n\n");
    pending = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
      if (data) opts.onEvent(JSON.parse(data));
    }
  }
}

export function postJson(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export function isLocalHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function isLocalCompanion(host: string, native: boolean, search: string): boolean {
  return !native && isLocalHost(host) && !new URLSearchParams(search).has("remote");
}
