import { describe, it, expect } from "vitest";
import {
  SupervisedChannel,
  backoffMs,
  changedHealth,
  formatHealthTransition,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  type ChannelHealth,
} from "./channel-supervisor.js";
import type { InboundMessage, PlatformAdapter } from "./base.js";

/** A child adapter whose poll/connect fail while `broken`, tracking call counts. */
function flakyAdapter(id: string, inbound: InboundMessage[]) {
  const state = { broken: false, connects: 0, disconnects: 0 };
  const child: PlatformAdapter = {
    id,
    connect: async () => {
      state.connects += 1;
      if (state.broken) throw new Error(`${id} connect failed`);
    },
    disconnect: async () => { state.disconnects += 1; },
    poll: async () => { if (state.broken) throw new Error(`${id} poll failed`); return inbound; },
    send: async () => {},
  };
  return { child, state };
}

describe("backoffMs", () => {
  it("grows exponentially from the base and caps at the max", () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(1)).toBe(BACKOFF_BASE_MS);
    expect(backoffMs(2)).toBe(BACKOFF_BASE_MS * 2);
    expect(backoffMs(3)).toBe(BACKOFF_BASE_MS * 4);
    expect(backoffMs(100)).toBe(BACKOFF_MAX_MS); // clamped
  });
});

describe("SupervisedChannel — self-heal", () => {
  it("drops to down on a failed poll and reports the error (never throws)", async () => {
    const { child, state } = flakyAdapter("slack", [{ chatId: "C1", text: "hi" }]);
    const sup = new SupervisedChannel(child, () => 0);
    state.broken = true;

    await expect(sup.poll()).resolves.toEqual([]); // swallowed, not thrown
    const h = sup.health();
    expect(h.status).toBe("down");
    expect(h.failures).toBe(1);
    expect(h.lastError).toContain("poll failed");
  });

  it("honors the backoff window before attempting a reconnect", async () => {
    const { child, state } = flakyAdapter("slack", []);
    let now = 0;
    const sup = new SupervisedChannel(child, () => now);
    state.broken = true;
    await sup.poll(); // fail #1 → nextRetry = 0 + BASE
    const reconnectsAfterFail = state.connects;

    now = BACKOFF_BASE_MS - 1; // still inside the window
    await sup.poll();
    expect(state.connects).toBe(reconnectsAfterFail); // no reconnect attempted yet
    expect(sup.health().status).toBe("down");
  });

  it("reconnects with backoff once healthy again and resumes delivering", async () => {
    const { child, state } = flakyAdapter("slack", [{ chatId: "C1", text: "back" }]);
    let now = 0;
    const sup = new SupervisedChannel(child, () => now);

    state.broken = true;
    await sup.poll(); // fail → down, nextRetry = BASE
    expect(sup.health().status).toBe("down");

    state.broken = false; // channel recovers
    now = BACKOFF_BASE_MS; // backoff elapsed
    const msgs = await sup.poll(); // reconnect (disconnect+connect) then poll

    expect(msgs).toEqual([{ chatId: "C1", text: "back" }]);
    const h = sup.health();
    expect(h.status).toBe("up");
    expect(h.failures).toBe(0);
    expect(h.lastReconnectAt).toBe(BACKOFF_BASE_MS);
    expect(state.disconnects).toBeGreaterThan(0); // it tore down before reconnecting
  });

  it("fires onChange exactly on the down and the recovery transitions", async () => {
    const { child, state } = flakyAdapter("tg", [{ chatId: "1", text: "ok" }]);
    const changes: ChannelHealth[] = [];
    let now = 0;
    const sup = new SupervisedChannel(child, () => now, (h) => changes.push({ ...h }));

    await sup.poll(); // up → stays up, no event
    expect(changes).toHaveLength(0);

    state.broken = true;
    await sup.poll(); // → down (1 event)
    await sup.poll(); // still down within window (no event)
    expect(changes).toHaveLength(1);
    expect(changes[0]?.status).toBe("down");

    state.broken = false;
    now = BACKOFF_MAX_MS;
    await sup.poll(); // → up (1 event)
    expect(changes).toHaveLength(2);
    expect(changes[1]?.status).toBe("up");
  });

  it("marks down when the initial connect fails so poll() will retry it", async () => {
    const { child, state } = flakyAdapter("slack", []);
    const sup = new SupervisedChannel(child, () => 0);
    state.broken = true;
    await sup.connect(); // connect throws internally
    expect(sup.health().status).toBe("down");
  });
});

describe("health diff + format (pure)", () => {
  it("changedHealth returns only entries whose status flipped", () => {
    const prev: ChannelHealth[] = [
      { id: "a", status: "up", failures: 0 },
      { id: "b", status: "up", failures: 0 },
    ];
    const curr: ChannelHealth[] = [
      { id: "a", status: "down", failures: 1 },
      { id: "b", status: "up", failures: 0 },
    ];
    expect(changedHealth(prev, curr).map((h) => h.id)).toEqual(["a"]);
  });

  it("formats down and up transitions distinctly", () => {
    expect(formatHealthTransition({ id: "a", status: "down", failures: 1, lastError: "boom" })).toContain(
      "down (boom)",
    );
    expect(formatHealthTransition({ id: "a", status: "up", failures: 0 })).toContain("recovered");
  });
});
