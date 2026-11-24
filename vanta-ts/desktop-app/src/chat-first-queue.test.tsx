import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatFirstQueue, updateQueuedMessage } from "./chat-first-queue.js";
import type { QueuedTurn } from "./types.js";

const item: QueuedTurn = {
  id: "queued-one", instruction: "Keep this instruction", intent: "next", status: "queued",
  target: { sessionId: "chat-one", root: "/disposable", controllerId: "custom", model: "local-proof", accessMode: "ask" },
  position: 0, revision: 7, createdAt: "2026-09-08", updatedAt: "2026-09-08",
};

function render(items: QueuedTurn[]) {
  return renderToStaticMarkup(<ChatFirstQueue items={items} error="" onRefresh={vi.fn()} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("chat-first queue capability parity", () => {
  it("retains ordering, steering, editing, removal and the actual target", () => {
    const html = render([item, { ...item, id: "queued-two", position: 1 }]);
    for (const label of ["Move earlier", "Move later", "Steer now", "Edit queued message", "Remove queued message"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain("custom");
    expect(html).toContain("local-proof");
    expect(html).toContain("Manual");
  });

  it("offers explicit retry for failed messages, never automatic steering", () => {
    const html = render([{ ...item, status: "failed", failure: { reason: "Provider unavailable", at: "now", attempts: 1 } }]);
    expect(html).toContain('aria-label="Retry message"');
    expect(html).not.toContain('aria-label="Steer now"');
    expect(html).toContain("Provider unavailable");
  });

  it("locks every mutation while a queued message is starting", () => {
    const html = render([{ ...item, status: "starting" }]);
    const buttons = html.match(/<button[^>]+>/g) ?? [];
    expect(buttons).toHaveLength(5);
    expect(buttons.every((button) => button.includes('disabled=""'))).toBe(true);
  });

  it("binds every queue change to its exact canonical ID and revision", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ revision: 8, items: [] }) }));
    vi.stubGlobal("fetch", fetch);
    await updateQueuedMessage(item, { action: "move", direction: "up" });
    await updateQueuedMessage(item, { action: "steer" });
    await updateQueuedMessage(item, { action: "retry" });
    expect(fetch.mock.calls.map((call) => JSON.parse((call as unknown as [string, RequestInit])[1].body as string))).toEqual([
      { action: "move", direction: "up", id: item.id, revision: 7 },
      { action: "steer", id: item.id, revision: 7 },
      { action: "retry", id: item.id, revision: 7 },
    ]);
  });

  it("does not retry rejected or uncertain queue mutations", async () => {
    const fetch = vi.fn(async () => { throw new Error("Disconnected"); });
    vi.stubGlobal("fetch", fetch);
    await expect(updateQueuedMessage(item, { action: "steer" })).rejects.toThrow("Disconnected");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
