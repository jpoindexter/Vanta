import { describe, expect, it } from "vitest";
import type { McpServerStatus } from "./server-control.js";
import {
  allReady,
  formatWaitResult,
  waitForMcpReady,
  type WaitForMcpResult,
} from "./wait-ready.js";

function status(name: string, state: McpServerStatus["state"]): McpServerStatus {
  return { name, state, toolCount: 0 };
}

/** A fake clock + sleep: each sleep advances `now` by the slept amount. */
function fakeClock(start = 0): { now: () => number; sleep: (ms: number) => Promise<void> } {
  let t = start;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe("allReady", () => {
  it("all connected → true", () => {
    expect(allReady([status("a", "connected"), status("b", "connected")])).toBe(true);
  });

  it("one error → false", () => {
    expect(allReady([status("a", "connected"), status("b", "error")])).toBe(false);
  });

  it("disabled servers are ignored (rest connected → true)", () => {
    expect(allReady([status("a", "connected"), status("b", "disabled")])).toBe(true);
  });

  it("no servers → true (nothing to wait for)", () => {
    expect(allReady([])).toBe(true);
  });

  it("honors a required subset (only named servers matter)", () => {
    const statuses = [status("a", "connected"), status("b", "error")];
    expect(allReady(statuses, ["a"])).toBe(true);
    expect(allReady(statuses, ["a", "b"])).toBe(false);
  });

  it("required server missing entirely → false", () => {
    expect(allReady([status("a", "connected")], ["ghost"])).toBe(false);
  });
});

describe("waitForMcpReady", () => {
  it("ready on the first poll → returns immediately (no sleeps)", async () => {
    const clock = fakeClock();
    let sleeps = 0;
    const result = await waitForMcpReady({
      getStatuses: () => [status("a", "connected")],
      sleep: async (ms) => {
        sleeps += 1;
        await clock.sleep(ms);
      },
      now: clock.now,
      timeoutMs: 5000,
      intervalMs: 100,
    });
    expect(result.ready).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.waitedMs).toBe(0);
    expect(sleeps).toBe(0);
  });

  it("no servers → ready immediately", async () => {
    const clock = fakeClock();
    const result = await waitForMcpReady({
      getStatuses: () => [],
      sleep: clock.sleep,
      now: clock.now,
    });
    expect(result.ready).toBe(true);
    expect(result.waitedMs).toBe(0);
  });

  it("becomes ready after K polls → resolves with ready + waitedMs", async () => {
    const clock = fakeClock();
    let calls = 0;
    const result = await waitForMcpReady({
      getStatuses: () => {
        calls += 1;
        // First 3 reads not ready (connecting via "error"), then connected.
        return calls >= 4 ? [status("a", "connected")] : [status("a", "error")];
      },
      sleep: clock.sleep,
      now: clock.now,
      timeoutMs: 5000,
      intervalMs: 100,
    });
    expect(result.ready).toBe(true);
    expect(result.timedOut).toBe(false);
    // first poll + 3 sleeps of 100ms = 300ms waited
    expect(result.waitedMs).toBe(300);
  });

  it("never ready → timedOut after timeoutMs", async () => {
    const clock = fakeClock();
    const result = await waitForMcpReady({
      getStatuses: () => [status("a", "error")],
      sleep: clock.sleep,
      now: clock.now,
      timeoutMs: 500,
      intervalMs: 100,
    });
    expect(result.ready).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.waitedMs).toBeGreaterThanOrEqual(500);
  });

  it("a getStatuses throw is treated as not-ready, never thrown out", async () => {
    const clock = fakeClock();
    const result = await waitForMcpReady({
      getStatuses: () => {
        throw new Error("status source down");
      },
      sleep: clock.sleep,
      now: clock.now,
      timeoutMs: 300,
      intervalMs: 100,
    });
    expect(result.ready).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.statuses).toEqual([]);
  });

  it("waits only on a required subset", async () => {
    const clock = fakeClock();
    let calls = 0;
    const result = await waitForMcpReady({
      getStatuses: () => {
        calls += 1;
        // "b" never connects, but only "a" is required.
        return calls >= 2
          ? [status("a", "connected"), status("b", "error")]
          : [status("a", "error"), status("b", "error")];
      },
      sleep: clock.sleep,
      now: clock.now,
      timeoutMs: 5000,
      intervalMs: 100,
      required: ["a"],
    });
    expect(result.ready).toBe(true);
    expect(result.waitedMs).toBe(100);
  });
});

describe("formatWaitResult", () => {
  it("summarizes a ready result with count + time", () => {
    const result: WaitForMcpResult = {
      ready: true,
      waitedMs: 1200,
      statuses: [status("a", "connected"), status("b", "connected")],
      timedOut: false,
    };
    expect(formatWaitResult(result)).toBe("✓ 2 MCP servers ready in 1.2s");
  });

  it("uses the singular for one ready server", () => {
    const result: WaitForMcpResult = {
      ready: true,
      waitedMs: 0,
      statuses: [status("a", "connected")],
      timedOut: false,
    };
    expect(formatWaitResult(result)).toBe("✓ 1 MCP server ready in 0.0s");
  });

  it("names the laggards on a timeout", () => {
    const result: WaitForMcpResult = {
      ready: false,
      waitedMs: 5000,
      statuses: [status("a", "connected"), status("b", "error"), status("c", "error")],
      timedOut: true,
    };
    expect(formatWaitResult(result)).toBe("⚠ timed out after 5.0s — b, c not connected");
  });

  it("respects a required subset when naming laggards", () => {
    const result: WaitForMcpResult = {
      ready: false,
      waitedMs: 5000,
      statuses: [status("a", "error"), status("b", "error")],
      timedOut: true,
    };
    expect(formatWaitResult(result, ["b"])).toBe("⚠ timed out after 5.0s — b not connected");
  });
});
