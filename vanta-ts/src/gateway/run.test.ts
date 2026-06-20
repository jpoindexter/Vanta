import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gatewayTick, pollPlatform, pollPlatformSession } from "./run.js";
import { initialState } from "./session-manager.js";
import type { CronEntry } from "../schedule/cron.js";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./platforms/base.js";
import { enqueueLoopWake } from "../loop/wake.js";
import { LoopDefSchema } from "../loop/types.js";
import { saveDef } from "../loop/store.js";

class FakeAdapter implements PlatformAdapter {
  readonly id = "fake";
  sent: OutboundMessage[] = [];
  constructor(private inbox: InboundMessage[]) {}
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
  const noCron = {
    dataDir: "/x",
    run: async () => ({ finalText: "" }),
    load: async () => [],
    log: () => {},
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
    expect(adapter.sent).toEqual([{ chatId: "42", text: "you said: status" }]);
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
    expect(handled).toEqual(["first task", "second task"]); // queued one ran after
    expect(adapter.sent.map((s) => s.text)).toEqual(["ok: first task", "ok: second task"]);
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
    // interrupt is not handled as a run nor queued/drained — only the first ran.
    expect(handled).toEqual(["long running job"]);
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
    expect(handled).toEqual(["build the thing"]);
    expect(logs.some((l) => l.includes("steer"))).toBe(true);
  });
});
