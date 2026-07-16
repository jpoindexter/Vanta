import { describe, expect, it, vi } from "vitest";
import {
  TaskTransitionTimeline,
  replayTaskTimeline,
  runRecordedTaskStep,
  verifyAndReplayTaskTimeline,
  type TaskTimelineMetadata,
} from "./timeline.js";
import { createRepoFixture } from "./fixtures.js";

const metadata: TaskTimelineMetadata = {
  adapterId: "repo-fixture",
  taskEnvironmentVersion: "1",
  model: { provider: "openai", id: "gpt-test", version: "2026-07-17" },
  approval: { mode: "acceptEdits", resolution: "approved" },
  correlation: { sessionId: "session-1", turnId: "turn-1", actionId: "action-1" },
};

function envelope(event: string, ts = 1): string {
  return JSON.stringify({ ts, event, h: "kernel-chain-hash" });
}

describe("TaskTransitionTimeline", () => {
  it("records a real task step through the shared environment runner", async () => {
    const logEvent = vi.fn<(event: string) => Promise<void>>(async () => {});
    const timeline = new TaskTransitionTimeline("run-step", "", { logEvent });

    const result = await runRecordedTaskStep(
      createRepoFixture(),
      { type: "write", path: "notes.md", content: "done" },
      timeline,
      metadata,
    );

    expect(result.ok).toBe(true);
    expect(JSON.parse(logEvent.mock.calls[0]![0])).toMatchObject({
      kind: "task_transition",
      status: "terminal",
      action: { type: "write", path: "notes.md" },
      terminal: "fixture_complete",
    });
  });

  it("appends predictions and actual observations as distinct kernel audit events", async () => {
    const logEvent = vi.fn<(event: string) => Promise<void>>(async () => {});
    const timeline = new TaskTransitionTimeline("run-1", "", { logEvent });

    const record = await timeline.appendTransition({
      ...metadata,
      status: "terminal",
      before: { snapshot: { files: {} }, observation: { paths: [] } },
      action: { type: "write", path: "notes.md", content: "done" },
      prediction: { summary: "write notes.md" },
      observed: { paths: ["notes.md"] },
      after: { files: { "notes.md": "done" } },
      terminal: "fixture_complete",
      verification: { ok: true, summary: "paths match snapshot" },
    });

    expect(record.sequence).toBe(1);
    expect(record.prediction).toEqual({ summary: "write notes.md" });
    expect(record.observed).toEqual({ paths: ["notes.md"] });
    expect(logEvent).toHaveBeenCalledOnce();
    const persisted = JSON.parse(logEvent.mock.calls[0]![0]);
    expect(persisted).toMatchObject({ kind: "task_transition", status: "terminal", sequence: 1 });
  });

  it("redacts secret values recursively before persistence", async () => {
    const logEvent = vi.fn<(event: string) => Promise<void>>(async () => {});
    const timeline = new TaskTransitionTimeline("run-secret", "", { logEvent });

    await timeline.appendTransition({
      ...metadata,
      status: "observed",
      before: { snapshot: { apiKey: "opaque-secret-value" }, observation: { authorization: "Bearer abcdef123456789012345" } },
      action: { type: "request", url: "https://example.com?token=hidden-value" },
      prediction: { summary: "request endpoint" },
      observed: { providerKey: "sk-abcdefghijklmnopqrstuvwxyz" },
      after: { ok: true },
      verification: { ok: true, summary: "done" },
    });

    const persisted = logEvent.mock.calls[0]![0];
    expect(persisted).not.toContain("opaque-secret-value");
    expect(persisted).not.toContain("abcdef123456789012345");
    expect(persisted).not.toContain("hidden-value");
    expect(persisted).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(persisted).toContain("[REDACTED]");
  });

  it("persists explicit reset, skipped, and partial outcomes", async () => {
    const logEvent = vi.fn<(event: string) => Promise<void>>(async () => {});
    const timeline = new TaskTransitionTimeline("run-outcomes", "", { logEvent });

    await timeline.appendMarker({ ...metadata, status: "reset", reason: "operator reset" });
    await timeline.appendMarker({ ...metadata, status: "skipped", reason: "dependency unavailable" });
    await timeline.appendTransition({
      ...metadata,
      status: "partial",
      before: { snapshot: {}, observation: {} },
      action: { type: "wait" },
      prediction: { summary: "wait" },
      observed: { progress: 0.5 },
      after: { progress: 0.5 },
      verification: { ok: false, summary: "not terminal" },
    });

    expect(logEvent.mock.calls.map(([event]) => JSON.parse(event).status)).toEqual(["reset", "skipped", "partial"]);
  });

  it("replays ordered transitions and resumes sequence numbers after restart", async () => {
    const first = JSON.stringify({ kind: "task_marker", version: 1, runId: "run-restart", sequence: 1, status: "reset", reason: "start over", ...metadata });
    const prior = `${envelope(first)}\n${envelope("not-json", 2)}\n`;
    const replayed = replayTaskTimeline(prior, "run-restart");
    expect(replayed.map((record) => record.sequence)).toEqual([1]);

    const logEvent = vi.fn<(event: string) => Promise<void>>(async () => {});
    const restarted = new TaskTransitionTimeline("run-restart", prior, { logEvent });
    const next = await restarted.appendMarker({ ...metadata, status: "skipped", reason: "no-op" });
    expect(next.sequence).toBe(2);
  });

  it("refuses replay when the kernel audit chain reports tampering", async () => {
    const verifyChain = vi.fn(async () => ({ ok: false as const, reason: "line 2 broke the audit chain" }));
    const result = await verifyAndReplayTaskTimeline("", verifyChain);

    expect(result).toEqual({ ok: false, error: "line 2 broke the audit chain" });
    expect(verifyChain).toHaveBeenCalledOnce();
  });
});
