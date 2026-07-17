import { describe, expect, it } from "vitest";
import { DesktopTurnQueue, QueueConflictError, type QueuedTurnTarget, type TurnQueueDeps } from "./turn-queue.js";

function harness() {
  let raw: string | null = null;
  let sequence = 0;
  let clock = Date.parse("2026-07-17T12:00:00.000Z");
  const alive = new Set([100]);
  const deps: TurnQueueDeps = {
    read: async () => raw,
    write: async (next) => { raw = next; },
    now: () => new Date(clock += 1_000),
    id: () => `turn-${++sequence}`,
    pid: () => 100,
    isAlive: (pid) => alive.has(pid),
  };
  return { deps, alive, stored: () => raw };
}

const target: QueuedTurnTarget = {
  sessionId: "session-1",
  root: "/project",
  controllerId: "local",
  model: "gpt-5.6-terra",
  accessMode: "approve",
};

describe("DesktopTurnQueue", () => {
  it("persists ordered turns and reloads them with their execution scope", async () => {
    const h = harness();
    const first = new DesktopTurnQueue(h.deps);
    await first.enqueue({ instruction: "Run source proof", target });
    await first.enqueue({ instruction: "Run packaged proof", target: { ...target, controllerId: "remote" } });

    const reloaded = await new DesktopTurnQueue(h.deps).list("session-1");
    expect(reloaded.items.map((item) => item.instruction)).toEqual(["Run source proof", "Run packaged proof"]);
    expect(reloaded.items[1]?.target).toMatchObject({ controllerId: "remote", model: "gpt-5.6-terra", accessMode: "approve" });
    expect(h.stored()).toContain("turn-2");
  });

  it("edits, reorders, steers, and cancels with monotonic revisions", async () => {
    const h = harness();
    const queue = new DesktopTurnQueue(h.deps);
    const a = await queue.enqueue({ instruction: "A", target });
    const b = await queue.enqueue({ instruction: "B", target });
    const c = await queue.enqueue({ instruction: "C", target });

    const edited = await queue.edit(b.id, b.revision, "B edited");
    await queue.move(c.id, c.revision, "up");
    const steered = await queue.steer(edited.id, edited.revision);
    await queue.cancel(a.id, a.revision);

    const snapshot = await queue.list("session-1");
    expect(snapshot.items.map((item) => [item.instruction, item.intent])).toEqual([["B edited", "steer"], ["C", "next"]]);
    expect(steered.revision).toBeGreaterThan(edited.revision);
    expect(snapshot.revision).toBeGreaterThan(3);
  });

  it("rejects stale edits and mutations after a turn has started", async () => {
    const h = harness();
    const queue = new DesktopTurnQueue(h.deps);
    const item = await queue.enqueue({ instruction: "One", target });
    await queue.edit(item.id, item.revision, "One revised");
    await expect(queue.cancel(item.id, item.revision)).rejects.toBeInstanceOf(QueueConflictError);

    const claimed = await queue.claimNext("session-1");
    expect(claimed?.status).toBe("starting");
    await expect(queue.edit(claimed!.id, claimed!.revision, "too late")).rejects.toMatchObject({ code: "already_started" });
  });

  it("recovers a claim owned by a dead runtime after restart", async () => {
    const h = harness();
    const queue = new DesktopTurnQueue(h.deps);
    await queue.enqueue({ instruction: "Recover me", target });
    const claimed = await queue.claimNext("session-1");
    expect(claimed?.ownerPid).toBe(100);
    h.alive.delete(100);

    const restarted = new DesktopTurnQueue({ ...h.deps, pid: () => 200 });
    const snapshot = await restarted.list("session-1");
    expect(snapshot.items[0]).toMatchObject({ id: claimed?.id, status: "queued" });
    expect(snapshot.items[0]?.ownerPid).toBeUndefined();
  });

  it("releases a failed claimed turn and removes a completed one", async () => {
    const h = harness();
    const queue = new DesktopTurnQueue(h.deps);
    await queue.enqueue({ instruction: "Retryable", target });
    const claimed = await queue.claimNext("session-1");
    await queue.release(claimed!.id);
    expect((await queue.list("session-1")).items[0]?.status).toBe("queued");
    const retried = await queue.claimNext("session-1");
    await queue.complete(retried!.id);
    expect((await queue.list("session-1")).items).toEqual([]);
  });
});
