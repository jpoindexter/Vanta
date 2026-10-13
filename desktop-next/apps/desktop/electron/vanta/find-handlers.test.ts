import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { CH } from "./channels";
import { registerFindHandlers } from "./find-handlers";
import type { IpcLike } from "./native-handlers";

function setup() {
  const contents = Object.assign(new EventEmitter(), {
    findInPage: vi.fn(() => 7),
    id: 3,
    isDestroyed: () => false,
    send: vi.fn(),
    stopFindInPage: vi.fn()
  });

  const window = { isDestroyed: () => false, webContents: contents };
  const handlers = new Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>();
  const ipc = { handle: (c, f) => handlers.set(c, f as never), on: () => undefined } as IpcLike;
  registerFindHandlers({ getWindow: () => window as never, ipc });

  // Chromium answers a find request with a found-in-page event carrying the request id.
  const find = async (query: unknown, options?: unknown) => {
    const pending = Promise.resolve(handlers.get(CH.findInPage)!({ sender: contents }, query, options));
    contents.emit("found-in-page", {}, { activeMatchOrdinal: 1, matches: 4, requestId: 7 });

    return pending;
  };

  return { contents, find, handlers };
}

describe("find in page", () => {
  it("searches the asking window, forwards the match count back to it, and acknowledges", async () => {
    const { contents, find } = setup();

    await expect(find("needle", { findNext: false, forward: true })).resolves.toEqual({ count: 0 });

    expect(contents.findInPage).toHaveBeenCalledWith("needle", { findNext: false, forward: true });
    expect(contents.send).toHaveBeenCalledWith("hermes:found-in-page", { activeMatchOrdinal: 1, count: 4 });
  });

  it("installs the result forwarder once per window", async () => {
    const { contents, find } = setup();

    await find("a");
    await find("b");

    expect(contents.listenerCount("found-in-page")).toBeGreaterThanOrEqual(1);
    expect(contents.send.mock.calls.filter(call => call[0] === "hermes:found-in-page")).toHaveLength(2);
  });

  it("does not search for an overlong query or a non-string", async () => {
    const { contents, find } = setup();

    await expect(find("x".repeat(501))).resolves.toEqual({ count: 0 });
    await expect(find(42)).resolves.toEqual({ count: 0 });

    expect(contents.findInPage).not.toHaveBeenCalled();
  });

  it("ignores unknown options rather than passing them to Chromium", async () => {
    const { contents, find } = setup();

    await find("a", { forward: false, matchCase: true, __proto__: { evil: 1 } });

    expect(contents.findInPage).toHaveBeenCalledWith("a", { findNext: false, forward: true });
  });

  it("clears the highlights on stop", async () => {
    const { contents, handlers } = setup();

    await handlers.get(CH.stopFindInPage)!({ sender: contents });

    expect(contents.stopFindInPage).toHaveBeenCalledWith("clearSelection");
  });
});
