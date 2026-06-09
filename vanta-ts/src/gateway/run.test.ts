import { describe, it, expect } from "vitest";
import { gatewayTick, pollPlatform } from "./run.js";
import type { CronEntry } from "../schedule/cron.js";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./platforms/base.js";

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
