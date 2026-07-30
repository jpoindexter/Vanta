import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QueuedTurnDrawer } from "./queued-turns.js";
import type { QueuedTurn } from "./types.js";

const item: QueuedTurn = {
  id: "q1", instruction: "Run the packaged proof", intent: "next", status: "queued", position: 1, revision: 1,
  createdAt: "2026-07-17T12:00:00.000Z", updatedAt: "2026-07-17T12:00:00.000Z",
  target: { sessionId: "s1", root: "/project", controllerId: "Local Mac", model: "gpt-5.6-terra", accessMode: "approve" },
};

describe("QueuedTurnDrawer", () => {
  it("shows execution order, instruction scope, and all safe actions", () => {
    const html = renderToStaticMarkup(<QueuedTurnDrawer open items={[item]} onClose={vi.fn()} onAction={vi.fn()} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Queue");
    expect(html).toContain("Runs after current task");
    expect(html).toContain("Run the packaged proof");
    expect(html).toContain("Local Mac");
    expect(html).toContain("gpt-5.6-terra");
    expect(html).toContain("Accept edits");
    expect(html).toContain("Move earlier");
    expect(html).toContain("Move later");
    expect(html).toContain("Edit message");
    expect(html).toContain("Steer now");
    expect(html).toContain("Remove from queue");
  });

  it("makes a starting item read-only so late mutations cannot appear to win", () => {
    const html = renderToStaticMarkup(<QueuedTurnDrawer open items={[{ ...item, status: "starting" }]} onClose={vi.fn()} onAction={vi.fn()} />);
    expect(html).toContain("Starting now");
    expect(html.match(/disabled=""/g)?.length).toBe(5);
  });

  it("shows the failure reason and retries only the failed message", () => {
    const failed: QueuedTurn = {
      ...item,
      status: "failed",
      failure: { reason: "Task stopped after repeated failures.", at: "2026-07-17T12:01:00.000Z", attempts: 1 },
    };
    const html = renderToStaticMarkup(<QueuedTurnDrawer open items={[failed]} onClose={vi.fn()} onAction={vi.fn()} />);
    expect(html).toContain("Task stopped after repeated failures.");
    expect(html).toContain("Retry message");
    expect(html).toContain("Edit message");
    expect(html).toContain("Remove from queue");
  });
});
