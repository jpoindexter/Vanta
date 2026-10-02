import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshDesktopInventory } from "./desktop-inventory-refresh.js";
import type { DesktopInventory } from "./desktop-inventory.js";

function harness() {
  const names = ["Status", "Sessions", "Tools", "Files", "Models", "Canvas", "Capabilities", "Messaging", "Google", "ReleaseProofs", "Artifacts", "Schedules", "Runtime", "Phase", "Error"];
  const inventory = Object.fromEntries(names.map((name) => [`set${name}`, vi.fn()])) as unknown as DesktopInventory;
  return { inventory, version: { current: 0 } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function response(value: unknown) { return { ok: true, json: async () => value }; }
afterEach(() => vi.unstubAllGlobals());

describe("Desktop inventory boundary", () => {
  it("makes the conversation ready before optional inventory settles", async () => {
    const canvas = deferred<unknown>();
    vi.stubGlobal("fetch", vi.fn(async (path) => response(path === "/api/canvas" ? await canvas.promise : [])));
    const { inventory, version } = harness();
    const refresh = refreshDesktopInventory(inventory, version);
    await vi.waitFor(() => expect(inventory.setPhase).toHaveBeenCalledWith("ready"));
    expect(inventory.setCanvas).not.toHaveBeenCalled();
    canvas.resolve(null); await refresh;
    expect(inventory.setCanvas).toHaveBeenCalledWith(null);
  });

  it("discards all stale authority and inventory after a newer change", async () => {
    const status = deferred<unknown>();
    vi.stubGlobal("fetch", vi.fn(async (path) => response(path === "/api/status" ? await status.promise : [])));
    const { inventory, version } = harness();
    const refresh = refreshDesktopInventory(inventory, version);
    version.current++;
    status.resolve({ accessMode: "full", model: "obsolete" }); await refresh;
    for (const setter of Object.values(inventory)) expect(setter).not.toHaveBeenCalled();
  });

  it("does not install optional results after a newer mutation", async () => {
    const canvas = deferred<unknown>();
    vi.stubGlobal("fetch", vi.fn(async (path) => response(path === "/api/canvas" ? await canvas.promise : [])));
    const { inventory, version } = harness();
    const refresh = refreshDesktopInventory(inventory, version);
    await vi.waitFor(() => expect(inventory.setPhase).toHaveBeenCalledWith("ready"));
    version.current++;
    canvas.resolve({ stale: true }); await refresh;
    expect(inventory.setCanvas).not.toHaveBeenCalled();
  });

  it("surfaces a critical failure and keeps provider setup reachable", async () => {
    const fetch = vi.fn(async (path) => {
      if (path === "/api/status") throw new Error("Runtime unavailable");
      return response(path === "/api/setup" ? [{ id: "setup-provider" }] : []);
    });
    vi.stubGlobal("fetch", fetch);
    const { inventory, version } = harness();
    await refreshDesktopInventory(inventory, version);
    await vi.waitFor(() => expect(inventory.setModels).toHaveBeenCalledWith([{ id: "setup-provider" }]));
    expect(inventory.setPhase).toHaveBeenCalledWith("error");
    expect(inventory.setError).toHaveBeenCalledWith("Runtime unavailable");
    expect(inventory.setPhase).not.toHaveBeenCalledWith("ready");
  });

  it("uses unavailable defaults without making optional failures block the chat", async () => {
    const critical = ["/api/status", "/api/sessions", "/api/tools", "/api/files", "/api/models"];
    vi.stubGlobal("fetch", vi.fn(async (path) => {
      if (!critical.includes(path)) throw new Error("Optional service unavailable");
      return response([]);
    }));
    const { inventory, version } = harness();
    await refreshDesktopInventory(inventory, version);
    expect(inventory.setPhase).toHaveBeenCalledWith("ready");
    expect(inventory.setRuntime).toHaveBeenCalledWith({ selectedHostId: "local", hosts: [] });
    expect(inventory.setGoogle).toHaveBeenCalledWith(expect.objectContaining({ authorized: false, status: "needs_setup" }));
    expect(inventory.setReleaseProofs).toHaveBeenCalledWith(null);
  });
});
