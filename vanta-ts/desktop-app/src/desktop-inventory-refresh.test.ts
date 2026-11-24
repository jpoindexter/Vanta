import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { refreshDesktopInventory } from "./desktop-inventory-refresh.js";
import type { DesktopInventory } from "./desktop-inventory.js";

const session = { id: "s1", title: "Chat", turns: 1, updated: "2026-10-13T10:00:00Z" };
const bodies: Record<string, unknown> = {
  "/api/status": { kernel: "online", sessionId: "s1", root: "/p" }, "/api/sessions": [session],
  "/api/tools": [], "/api/files": [], "/api/models": [],
};

function inventory() {
  const calls: Record<string, unknown[]> = {};
  const record = (name: string) => vi.fn((value: unknown) => { (calls[name] ??= []).push(value); });
  const names = ["setStatus", "setSessions", "setTools", "setFiles", "setModels", "setCanvas", "setCapabilities", "setMessaging",
    "setArtifacts", "setRuntime", "setGoogle", "setReleaseProofs", "setSchedules", "setPhase", "setError"] as const;
  const setters = Object.fromEntries(names.map((name) => [name, record(name)]));
  return { value: setters as unknown as DesktopInventory, calls };
}

beforeEach(() => {
  vi.useFakeTimers();
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("keeps loading and retries with backoff while the runtime is not reachable, then becomes ready", async () => {
  let failures = 2;
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path === "/api/status" && failures > 0) { failures -= 1; throw new TypeError("Failed to fetch"); }
    return new Response(JSON.stringify(bodies[path] ?? null));
  }));
  const { value, calls } = inventory();
  const done = refreshDesktopInventory(value, { current: 0 });
  await vi.advanceTimersByTimeAsync(5000);
  await done;
  expect(calls.setPhase).toEqual(["ready"]);
  expect(calls.setError).toEqual([""]);
  expect(globalThis.localStorage.getItem("vanta.desktop.sessions-cache.v1")).toContain("s1");
});

it("reports an error immediately for a runtime answer that is not a connection failure", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) =>
    path === "/api/status" ? new Response(JSON.stringify({ error: "OPENAI_API_KEY is not set" }), { status: 500 }) : new Response(JSON.stringify(bodies[path] ?? null))));
  const { value, calls } = inventory();
  await refreshDesktopInventory(value, { current: 0 });
  expect(calls.setPhase).toEqual(["error"]);
  expect(calls.setError).toEqual(["OPENAI_API_KEY is not set"]);
});

it("gives up after the last attempt and shows the connection error", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  const { value, calls } = inventory();
  const done = refreshDesktopInventory(value, { current: 0 });
  await vi.advanceTimersByTimeAsync(30_000);
  await done;
  expect(calls.setPhase).toEqual(["error"]);
});
