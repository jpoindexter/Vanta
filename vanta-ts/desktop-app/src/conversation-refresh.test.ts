import { describe, expect, it, vi } from "vitest";
import { refreshActiveConversation } from "./conversation-refresh.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  const status = deferred<{ model: string }>();
  const inventory = deferred<void>();
  const target = {
    version: { current: 0 }, readStatus: vi.fn(() => status.promise),
    accept: vi.fn(), reject: vi.fn(), refreshInventory: vi.fn(() => inventory.promise),
  };
  return { status, inventory, target };
}

describe("active conversation refresh", () => {
  it("waits for the selected model authority but not unrelated artifacts or inventories", async () => {
    const { target, status, inventory } = harness();
    const refreshing = refreshActiveConversation(target);
    expect(target.accept).not.toHaveBeenCalled();
    expect(target.refreshInventory).not.toHaveBeenCalled();
    status.resolve({ model: "selected-session-model" });
    await refreshing;
    expect(target.accept).toHaveBeenCalledWith({ model: "selected-session-model" });
    expect(target.refreshInventory).toHaveBeenCalledOnce();
    expect(target.reject).not.toHaveBeenCalled();
    inventory.resolve();
  });

  it("invalidates the older aggregate refresh before reading the new model", async () => {
    const { target, status } = harness();
    target.version.current = 5;
    const refreshing = refreshActiveConversation(target);
    expect(target.version.current).toBe(6);
    status.resolve({ model: "new-model" });
    await refreshing;
  });

  it("fails closed if current model authority cannot be read", async () => {
    const { target, status } = harness();
    const refreshing = refreshActiveConversation(target);
    status.reject(new Error("Runtime unavailable"));
    await expect(refreshing).rejects.toThrow("Runtime unavailable");
    expect(target.reject).toHaveBeenCalledWith("Runtime unavailable");
    expect(target.accept).not.toHaveBeenCalled();
    expect(target.refreshInventory).not.toHaveBeenCalled();
  });

  it("never installs stale status after a newer mutation", async () => {
    const { target, status } = harness();
    const refreshing = refreshActiveConversation(target);
    target.version.current++;
    status.resolve({ model: "stale-model" });
    await expect(refreshing).rejects.toThrow("changed");
    expect(target.accept).not.toHaveBeenCalled();
    expect(target.reject).not.toHaveBeenCalled();
    expect(target.refreshInventory).not.toHaveBeenCalled();
  });

  it("does not replace newer status with an obsolete failure", async () => {
    const { target, status } = harness();
    const refreshing = refreshActiveConversation(target);
    target.version.current++;
    status.reject(new Error("Old request failed"));
    await expect(refreshing).rejects.toThrow("Old request failed");
    expect(target.reject).not.toHaveBeenCalled();
  });

  it("reports a current background failure without an unhandled rejection", async () => {
    const { target, status, inventory } = harness();
    const refreshing = refreshActiveConversation(target);
    status.resolve({ model: "new-model" });
    await refreshing;
    inventory.reject(new Error("Inventory unavailable"));
    await Promise.resolve();
    expect(target.reject).toHaveBeenCalledWith("Inventory unavailable");
  });
});
