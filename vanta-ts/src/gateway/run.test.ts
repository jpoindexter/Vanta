import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gatewayTick, pollPlatform, pollPlatformSession, runGatewayLoop } from "./run.js";
import { initialState } from "./session-manager.js";
import type { CronEntry } from "../schedule/cron.js";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./platforms/base.js";
import { enqueueLoopWake } from "../loop/wake.js";
import { LoopDefSchema } from "../loop/types.js";
import { saveDef } from "../loop/store.js";
import { createReplyBus } from "../permissions/reply-bus.js";
import { loadMobileRuns, startMobileRun } from "./mobile-control.js";
import { createGoalSentinel } from "../goals/sentinel.js";

class FakeAdapter implements PlatformAdapter {
  sent: OutboundMessage[] = [];
  constructor(private inbox: InboundMessage[], readonly id = "fake") {}
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async poll(): Promise<InboundMessage[]> {
    const m = this.inbox;
    this.inbox = [];
    return m;
  }
  async send(msg: OutboundMessage): Promise<void> {
    this.sent.push(msg);
  }
}

describe("gatewayTick", () => {
  it("returns 0 and runs nothing when no tasks are due", async () => {
    let calls = 0;
    const n = await gatewayTick({
      dataDir: "/x",
      run: async () => {
        calls++;
        return { finalText: "ran" };
      },
      now: () => new Date("2026-06-02T12:00:00Z"),
      log: () => {},
      load: async () => [],
    });
    expect(n).toBe(0);
    expect(calls).toBe(0);
  });

  it("runs every due active task and logs a line per result", async () => {
    const entries: CronEntry[] = [
      { id: 1, cron: "* * * * *", instruction: "daily brief", status: "active" },
      { id: 2, cron: "* * * * *", instruction: "paused one", status: "paused" },
    ];
    const ran: string[] = [];
    const logs: string[] = [];
    const n = await gatewayTick({
      dataDir: "/x",
      run: async (instruction) => {
        ran.push(instruction);
        return { finalText: `did: ${instruction}` };
      },
      now: () => new Date("2026-06-02T12:00:00Z"),
      log: (m) => logs.push(m),
      load: async () => entries,
    });
    expect(n).toBe(1); // only the active one
    expect(ran).toEqual(["daily brief"]);
    expect(logs.some((l) => l.includes("#1") && l.includes("did: daily brief"))).toBe(true);
  });

  it("drains queued loop wakes before running due cron work", async () => {
    const calls: string[] = [];
    const dataDir = await mkdtemp(join(tmpdir(), "vanta-gateway-wake-"));
    try {
      await saveDef(dataDir, LoopDefSchema.parse({
        id: "owner",
        goal: "resume",
        trigger: { kind: "event", event: "approval.resolved" },
        stages: [{ name: "run", prompt: "go" }],
        createdAt: "2026-06-18T00:00:00.000Z",
      }));
      await enqueueLoopWake(dataDir, { wake_reason: "approval.resolved", goal_id: "owner", since: null, delta: [] });

      const n = await gatewayTick({
        dataDir,
        run: async () => {
          calls.push("cron");
          return { finalText: "ran" };
        },
        spawnLoop: (id) => void calls.push(`wake:${id}`),
        now: () => new Date("2026-06-02T12:00:00Z"),
        log: () => {},
        load: async () => [{ id: 1, cron: "* * * * *", instruction: "daily", status: "active" }],
      });

      expect(n).toBe(2);
      expect(calls).toEqual(["wake:owner", "cron"]);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("a throwing task is captured, not fatal (counts as run)", async () => {
    const entries: CronEntry[] = [
      { id: 7, cron: "* * * * *", instruction: "boom", status: "active" },
    ];
    const logs: string[] = [];
    const n = await gatewayTick({
      dataDir: "/x",
      run: async () => {
        throw new Error("kaboom");
      },
      now: () => new Date("2026-06-02T12:00:00Z"),
      log: (m) => logs.push(m),
      load: async () => entries,
    });
    expect(n).toBe(1);
    expect(logs.some((l) => l.includes("error: kaboom"))).toBe(true);
  });

  it("runs daily standing-goal checks and wakes the operator on failure", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "vanta-gateway-sentinel-"));
    const notify = vi.fn();
    const logs: string[] = [];
    try {
      await createGoalSentinel(dataDir, { goalId: 9, goalText: "keep green", command: "false" });
      const n = await gatewayTick({
        dataDir,
        run: async () => ({ finalText: "unused" }),
        now: () => new Date("2026-07-10T12:00:00Z"),
        log: (line) => logs.push(line),
        load: async () => [],
        sentinelNotify: notify,
      });

      expect(n).toBe(1);
      expect(logs).toContainEqual(expect.stringContaining("sentinel wake goal-9"));
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ notificationType: "standing_goal_violation" }));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});

describe("runGatewayLoop", () => {
  it("polls channels repeatedly without rerunning minute-level maintenance", async () => {
    let maintenanceRuns = 0;
    let polls = 0;
    const adapter = new FakeAdapter([]);
    adapter.poll = async () => {
      polls += 1;
      return [];
    };

    await runGatewayLoop({
      deps: {
        dataDir: "/x",
        run: async () => ({ finalText: "" }),
        load: async () => {
          maintenanceRuns += 1;
          return [];
        },
        handle: async () => "ok",
        log: () => {},
        platform: adapter,
      },
      tickMs: 60_000,
      channelPollMs: 1,
      log: () => {},
      isRunning: () => true,
      maxCycles: 3,
    });

    expect(polls).toBe(3);
    expect(maintenanceRuns).toBe(1);
  });
});

describe("pollPlatform", () => {
  const noCron = {
    dataDir: "/x",
    run: async () => ({ finalText: "" }),
    load: async () => [],
    log: () => {},
  };

  it("is a no-op with no platform configured", async () => {
    expect(await pollPlatform(noCron)).toBe(0);
  });

  it("runs each inbound message through handle and sends the reply", async () => {
    const adapter = new FakeAdapter([
      { chatId: "42", text: "what's my status", from: "jp" },
    ]);
    const n = await pollPlatform({
      ...noCron,
      platform: adapter,
      handle: async (text) => `you said: ${text}`,
    });
    expect(n).toBe(1);
    expect(adapter.sent).toEqual([{ chatId: "42", text: "you said: what's my status" }]);
  });

  it("turns a handler error into the reply (user always hears back)", async () => {
    const adapter = new FakeAdapter([{ chatId: "9", text: "boom" }]);
    await pollPlatform({
      ...noCron,
      platform: adapter,
      handle: async () => {
        throw new Error("model down");
      },
    });
    expect(adapter.sent[0]?.text).toContain("error: model down");
  });
});

describe("pollPlatformSession (concurrent inbound routing)", () => {
  // Pin `now` so the inbound-pipeline timestamp prefix is deterministic. The
  // agent now receives a `[ts] <text>` rendering (MSG-INBOUND-TIMESTAMP); routing
  // + reply delivery semantics are unchanged (routing reads the clean text).
  const TS = "[Sat 2026-06-20 12:00]";
  const noCron = {
    dataDir: "/x",
    run: async () => ({ finalText: "" }),
    load: async () => [],
    log: () => {},
    now: () => new Date(2026, 5, 20, 12, 0),
  };

  it("is a no-op (delegates) with no platform configured", async () => {
    const r = await pollPlatformSession(noCron, initialState());
    expect(r.count).toBe(0);
    expect(r.state).toEqual(initialState());
  });

  it("handles a single idle message exactly like the legacy path", async () => {
    const adapter = new FakeAdapter([{ chatId: "42", text: "status", from: "jp" }]);
    const r = await pollPlatformSession(
      { ...noCron, platform: adapter, handle: async (t) => `you said: ${t}` },
      initialState(),
    );
    expect(r.count).toBe(1);
    // The agent saw the timestamped text; the reply is delivered to the same chat.
    expect(adapter.sent).toEqual([{ chatId: "42", text: `you said: ${TS} status` }]);
    expect(r.state.running).toBe(false); // settles idle after the batch drains
  });

  it("runs the first, queues a concurrent plain message, drains it FIFO", async () => {
    const adapter = new FakeAdapter([
      { chatId: "1", text: "first task" },
      { chatId: "1", text: "second task" },
    ]);
    const handled: string[] = [];
    const r = await pollPlatformSession(
      { ...noCron, platform: adapter, handle: async (t) => { handled.push(t); return `ok: ${t}`; } },
      initialState(),
    );
    expect(r.count).toBe(2);
    // FIFO order preserved; each reaches the agent timestamped.
    expect(handled).toEqual([`${TS} first task`, `${TS} second task`]);
    expect(adapter.sent.map((s) => s.text)).toEqual([`ok: ${TS} first task`, `ok: ${TS} second task`]);
    expect(r.state.running).toBe(false);
  });

  it("routes a concurrent /stop as interrupt (logged, not queued/replied)", async () => {
    const adapter = new FakeAdapter([
      { chatId: "1", text: "long running job" },
      { chatId: "1", text: "/stop" },
    ]);
    const logs: string[] = [];
    const handled: string[] = [];
    await pollPlatformSession(
      { ...noCron, log: (m) => logs.push(m), platform: adapter, handle: async (t) => { handled.push(t); return "done"; } },
      initialState(),
    );
    // interrupt is classified on the clean text → only the first ran.
    expect(handled).toEqual([`${TS} long running job`]);
    expect(logs.some((l) => l.includes("interrupt"))).toBe(true);
  });

  it("routes a concurrent >> message as steer (logged, not queued)", async () => {
    const adapter = new FakeAdapter([
      { chatId: "1", text: "build the thing" },
      { chatId: "1", text: ">> use the other module" },
    ]);
    const logs: string[] = [];
    const handled: string[] = [];
    await pollPlatformSession(
      { ...noCron, log: (m) => logs.push(m), platform: adapter, handle: async (t) => { handled.push(t); return "done"; } },
      initialState(),
    );
    // steer is classified on the clean ">>" prefix → only the first ran.
    expect(handled).toEqual([`${TS} build the thing`]);
    expect(logs.some((l) => l.includes("steer"))).toBe(true);
  });

  it("consumes mobile control commands before they become agent turns", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "vanta-mobile-session-"));
    const bus = createReplyBus();
    try {
      const prior = await startMobileRun(dataDir, { chatId: "phone-1", text: "prior task" }, new Date("2026-07-09T00:00:00.000Z"));
      bus.register("abc123");
      const adapter = new FakeAdapter([
        { chatId: "phone-1", text: "/runs" },
        { chatId: "phone-1", text: `/pause ${prior.id}` },
        { chatId: "phone-1", text: "/approve abc123" },
      ]);
      const handled: string[] = [];
      const r = await pollPlatformSession(
        { ...noCron, dataDir, platform: adapter, replyBus: bus, handle: async (t) => { handled.push(t); return "agent"; } },
        initialState(),
      );
      expect(r.count).toBe(0);
      expect(handled).toEqual([]);
      expect(adapter.sent.map((s) => s.text)).toEqual([
        expect.stringContaining(prior.id),
        `Paused ${prior.id}.`,
        "Approved abc123.",
      ]);
      expect((await loadMobileRuns(dataDir)).find((run) => run.id === prior.id)?.status).toBe("paused");
    } finally {
      bus.unregister("abc123");
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("sends one progress bubble before a token-window reply expires", async () => {
    const adapter = new FakeAdapter([{ chatId: "line-user", text: "slow task" }], "line");
    let finish!: () => void;
    const done = new Promise<void>((resolve) => { finish = resolve; });
    const run = pollPlatformSession(
      {
        ...noCron,
        platform: adapter,
        progressBubble: { thresholdMs: 1 },
        handle: async () => {
          await done;
          return "final answer";
        },
      },
      initialState(),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(adapter.sent).toEqual([{ chatId: "line-user", text: expect.stringContaining("Still working") }]);
    finish();
    await run;
    expect(adapter.sent).toEqual([
      { chatId: "line-user", text: expect.stringContaining("Still working") },
      { chatId: "line-user", text: "final answer" },
    ]);
  });
});
