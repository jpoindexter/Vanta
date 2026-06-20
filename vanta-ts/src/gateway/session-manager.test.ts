import { describe, it, expect } from "vitest";
import type { InboundMessage } from "./platforms/base.js";
import {
  classifyInbound,
  initialState,
  routeInbound,
  markFinished,
  takeNext,
} from "./session-manager.js";

function msg(text: string, chatId = "1"): InboundMessage {
  return { chatId, text };
}

describe("classifyInbound", () => {
  it("classifies interrupt commands", () => {
    expect(classifyInbound("!")).toBe("interrupt");
    expect(classifyInbound("! stop now")).toBe("interrupt");
    expect(classifyInbound("/stop")).toBe("interrupt");
    expect(classifyInbound("/interrupt please")).toBe("interrupt");
    expect(classifyInbound("/STOP")).toBe("interrupt"); // case-insensitive
  });

  it("classifies steer commands", () => {
    expect(classifyInbound("/steer focus on the bug")).toBe("steer");
    expect(classifyInbound(">> actually use the other file")).toBe("steer");
    expect(classifyInbound(">>change direction")).toBe("steer");
  });

  it("defaults everything else to queue", () => {
    expect(classifyInbound("what is my status")).toBe("queue");
    expect(classifyInbound("")).toBe("queue");
    expect(classifyInbound("steer me wrong")).toBe("queue"); // no leading command
    expect(classifyInbound("stop")).toBe("queue"); // bare word, no slash
  });

  it("does not mistake a longer word for a command token", () => {
    expect(classifyInbound("/stopwatch the timer")).toBe("queue");
    expect(classifyInbound("/interruptions report")).toBe("queue");
  });

  it("respects leading whitespace before a command", () => {
    expect(classifyInbound("   /stop")).toBe("interrupt");
    expect(classifyInbound("  >> nudge")).toBe("steer");
  });
});

describe("routeInbound", () => {
  it("runs immediately when idle (run-now) and flips to running", () => {
    const { state, action } = routeInbound(initialState(), msg("do a thing"));
    expect(action).toBe("run-now");
    expect(state.running).toBe(true);
    expect(state.queue).toEqual([]);
  });

  it("queues a plain message when a run is in flight (default)", () => {
    const busy = { running: true, queue: [] };
    const { state, action } = routeInbound(busy, msg("later please"));
    expect(action).toBe("queue");
    expect(state.queue.map((m) => m.text)).toEqual(["later please"]);
    expect(state.running).toBe(true);
  });

  it("routes interrupt per the leading command without queuing", () => {
    const busy = { running: true, queue: [] };
    const { state, action } = routeInbound(busy, msg("/stop"));
    expect(action).toBe("interrupt");
    expect(state.queue).toEqual([]); // interrupt is acted on, not queued
  });

  it("routes steer per the leading command without queuing", () => {
    const busy = { running: true, queue: [msg("queued")] };
    const { state, action } = routeInbound(busy, msg(">> change focus"));
    expect(action).toBe("steer");
    expect(state.queue.map((m) => m.text)).toEqual(["queued"]); // unchanged
  });

  it("an interrupt-command message while idle still runs now (no live run to interrupt)", () => {
    const { action, state } = routeInbound(initialState(), msg("/stop"));
    expect(action).toBe("run-now");
    expect(state.running).toBe(true);
  });
});

describe("queue drain (FIFO) when a run finishes", () => {
  it("drains queued messages first-in-first-out across finish/takeNext cycles", () => {
    let state = routeInbound(initialState(), msg("first")).state; // run-now, running
    state = routeInbound(state, msg("second")).state; // queued
    state = routeInbound(state, msg("third")).state; // queued
    expect(state.queue.map((m) => m.text)).toEqual(["second", "third"]);

    // First run finishes; take the next queued message.
    state = markFinished(state);
    const a = takeNext(state);
    expect(a.msg?.text).toBe("second");
    state = a.state;
    expect(state.running).toBe(true);
    expect(state.queue.map((m) => m.text)).toEqual(["third"]);

    // Second run finishes; take the last queued message.
    state = markFinished(state);
    const b = takeNext(state);
    expect(b.msg?.text).toBe("third");
    state = b.state;
    expect(state.queue).toEqual([]);

    // Third run finishes; nothing left to drain.
    state = markFinished(state);
    const c = takeNext(state);
    expect(c.msg).toBeUndefined();
    expect(c.state.running).toBe(false);
  });

  it("takeNext is a no-op while a run is still in flight", () => {
    const busy = { running: true, queue: [msg("waiting")] };
    const { state, msg: next } = takeNext(busy);
    expect(next).toBeUndefined();
    expect(state.queue.map((m) => m.text)).toEqual(["waiting"]);
  });

  it("takeNext is a no-op when idle with an empty queue", () => {
    const { state, msg: next } = takeNext(initialState());
    expect(next).toBeUndefined();
    expect(state).toEqual(initialState());
  });
});
