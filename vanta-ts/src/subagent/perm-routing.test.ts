import { describe, it, expect } from "vitest";
import {
  buildForwardedAsk,
  enqueueAsk,
  routeDecision,
  pendingForWorker,
  nextPendingAsk,
  emptyPermRouterState,
  type ForwardedAsk,
  type PermRouterState,
} from "./perm-routing.js";
import type { PermissionRequest } from "../permissions/request.js";

function req(subject = "rm -rf /tmp/x"): PermissionRequest {
  return {
    kind: "bash",
    title: "Bash permission request",
    subject,
    reason: "worker needs to run a command",
    toolName: "shell_cmd",
    sections: [{ label: "Command", value: subject, tone: "code" }],
  };
}

function ask(askId: string, workerId: string, askedAt: string): ForwardedAsk {
  return buildForwardedAsk(workerId, req(), askId, askedAt);
}

describe("buildForwardedAsk", () => {
  it("builds the forward payload from worker, request, askId", () => {
    const r = req("ls -la");
    const fwd = buildForwardedAsk("worker-1", r, "ask-1", "2026-06-21T10:00:00.000Z");
    expect(fwd).toEqual({
      askId: "ask-1",
      workerId: "worker-1",
      request: r,
      askedAt: "2026-06-21T10:00:00.000Z",
    });
  });

  it("defaults askedAt to an ISO timestamp when omitted", () => {
    const fwd = buildForwardedAsk("worker-1", req(), "ask-1");
    expect(fwd.askedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number.isNaN(Date.parse(fwd.askedAt))).toBe(false);
  });

  it("carries the typed request through unchanged (lead surfaces it)", () => {
    const r = req("git push --force");
    const fwd = buildForwardedAsk("worker-2", r, "ask-9");
    expect(fwd.request.subject).toBe("git push --force");
    expect(fwd.request.toolName).toBe("shell_cmd");
  });
});

describe("enqueueAsk", () => {
  it("appends an ask to the pending queue", () => {
    const s0 = emptyPermRouterState();
    const s1 = enqueueAsk(s0, ask("ask-1", "w1", "2026-06-21T10:00:00.000Z"));
    expect(s1.pending.map((p) => p.askId)).toEqual(["ask-1"]);
  });

  it("dedupes by askId — a re-forwarded ask does not double-queue", () => {
    let s = emptyPermRouterState();
    s = enqueueAsk(s, ask("ask-1", "w1", "2026-06-21T10:00:00.000Z"));
    s = enqueueAsk(s, ask("ask-1", "w1", "2026-06-21T10:00:01.000Z"));
    expect(s.pending).toHaveLength(1);
    expect(s.pending.map((p) => p.askId)).toEqual(["ask-1"]);
  });

  it("does not mutate the input state (immutable)", () => {
    const s0 = emptyPermRouterState();
    const s1 = enqueueAsk(s0, ask("ask-1", "w1", "2026-06-21T10:00:00.000Z"));
    expect(s0.pending).toHaveLength(0);
    expect(s1).not.toBe(s0);
  });

  it("queues concurrent asks from multiple workers independently", () => {
    let s: PermRouterState = emptyPermRouterState();
    s = enqueueAsk(s, ask("ask-a", "w1", "2026-06-21T10:00:00.000Z"));
    s = enqueueAsk(s, ask("ask-b", "w2", "2026-06-21T10:00:01.000Z"));
    s = enqueueAsk(s, ask("ask-c", "w1", "2026-06-21T10:00:02.000Z"));
    expect(s.pending.map((p) => p.askId)).toEqual(["ask-a", "ask-b", "ask-c"]);
  });
});

describe("routeDecision", () => {
  function seeded(): PermRouterState {
    let s = emptyPermRouterState();
    s = enqueueAsk(s, ask("ask-1", "w1", "2026-06-21T10:00:00.000Z"));
    s = enqueueAsk(s, ask("ask-2", "w2", "2026-06-21T10:00:01.000Z"));
    return s;
  }

  it("finds the pending ask, removes it, and returns the worker target", () => {
    const { state, target } = routeDecision(seeded(), "ask-1", "allow");
    expect(target).toEqual({ workerId: "w1", decision: "allow" });
    expect(state.pending.map((p) => p.askId)).toEqual(["ask-2"]);
  });

  it("routes a deny decision back to the asking worker", () => {
    const { target } = routeDecision(seeded(), "ask-2", "deny");
    expect(target).toEqual({ workerId: "w2", decision: "deny" });
  });

  it("ignores an unknown askId — state unchanged, target null", () => {
    const before = seeded();
    const { state, target } = routeDecision(before, "ask-unknown", "allow");
    expect(target).toBeNull();
    expect(state.pending.map((p) => p.askId)).toEqual(["ask-1", "ask-2"]);
  });

  it("a decision for an already-resolved ask is ignored safely (no double-route)", () => {
    const first = routeDecision(seeded(), "ask-1", "allow");
    const second = routeDecision(first.state, "ask-1", "allow");
    expect(second.target).toBeNull();
    expect(second.state.pending.map((p) => p.askId)).toEqual(["ask-2"]);
  });

  it("does not mutate the input state (immutable)", () => {
    const before = seeded();
    const { state } = routeDecision(before, "ask-1", "allow");
    expect(before.pending).toHaveLength(2);
    expect(state).not.toBe(before);
  });
});

describe("pendingForWorker", () => {
  it("filters to one worker's pending asks, oldest-first by enqueue order", () => {
    let s = emptyPermRouterState();
    s = enqueueAsk(s, ask("ask-1", "w1", "2026-06-21T10:00:00.000Z"));
    s = enqueueAsk(s, ask("ask-2", "w2", "2026-06-21T10:00:01.000Z"));
    s = enqueueAsk(s, ask("ask-3", "w1", "2026-06-21T10:00:02.000Z"));
    expect(pendingForWorker(s, "w1").map((p) => p.askId)).toEqual(["ask-1", "ask-3"]);
    expect(pendingForWorker(s, "w2").map((p) => p.askId)).toEqual(["ask-2"]);
  });

  it("returns an empty array for a worker with no pending asks", () => {
    expect(pendingForWorker(emptyPermRouterState(), "ghost")).toEqual([]);
  });
});

describe("nextPendingAsk", () => {
  it("returns null when the queue is empty", () => {
    expect(nextPendingAsk(emptyPermRouterState())).toBeNull();
  });

  it("returns the oldest pending ask by askedAt for the lead to surface", () => {
    let s = emptyPermRouterState();
    // enqueue out of timestamp order to prove ordering is by askedAt, not insert
    s = enqueueAsk(s, ask("ask-late", "w2", "2026-06-21T10:05:00.000Z"));
    s = enqueueAsk(s, ask("ask-early", "w1", "2026-06-21T10:00:00.000Z"));
    s = enqueueAsk(s, ask("ask-mid", "w3", "2026-06-21T10:02:00.000Z"));
    expect(nextPendingAsk(s)?.askId).toBe("ask-early");
  });

  it("after routing the oldest, surfaces the next-oldest", () => {
    let s = emptyPermRouterState();
    s = enqueueAsk(s, ask("ask-1", "w1", "2026-06-21T10:00:00.000Z"));
    s = enqueueAsk(s, ask("ask-2", "w2", "2026-06-21T10:01:00.000Z"));
    const { state } = routeDecision(s, "ask-1", "allow");
    expect(nextPendingAsk(state)?.askId).toBe("ask-2");
  });
});
