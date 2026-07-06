import { describe, it, expect } from "vitest";
import { A2ABus, LocalDelivery, makeMessage, type DeliveryTransport } from "./local.js";
import type { A2AMessage, A2AHandler } from "./types.js";

const echo: A2AHandler = (msg: A2AMessage) =>
  makeMessage({
    from: msg.to,
    to: msg.from,
    role: "agent",
    text: `echo: ${msg.parts.map((p) => p.text).join(" ")}`,
  });

describe("A2ABus", () => {
  it("routes a message to the registered handler and returns its reply", async () => {
    const bus = new A2ABus();
    bus.register("echo", echo);

    const reply = await bus.send(
      makeMessage({ from: "alice", to: "echo", text: "hello" }),
    );

    expect(reply).not.toBeNull();
    expect(reply?.from).toBe("echo");
    expect(reply?.to).toBe("alice");
    expect(reply?.role).toBe("agent");
    expect(reply?.parts).toEqual([{ kind: "text", text: "echo: hello" }]);
  });

  it("throws a clear error when no agent is registered for the target", async () => {
    const bus = new A2ABus();
    await expect(
      bus.send(makeMessage({ from: "alice", to: "ghost", text: "hi" })),
    ).rejects.toThrow(/no agent registered for "ghost"/);
  });

  it("lists registered agent ids and drops them on unregister", () => {
    const bus = new A2ABus();
    bus.register("a", echo);
    bus.register("b", echo);
    expect(bus.list().sort()).toEqual(["a", "b"]);

    bus.unregister("a");
    expect(bus.list()).toEqual(["b"]);
  });

  it("passes through a null reply from a silent handler", async () => {
    const bus = new A2ABus();
    bus.register("silent", () => null);
    const reply = await bus.send(
      makeMessage({ from: "alice", to: "silent", text: "anyone there" }),
    );
    expect(reply).toBeNull();
  });
});

describe("makeMessage", () => {
  it("wraps text into a single text part with sensible defaults", () => {
    const msg = makeMessage({ from: "a", to: "b", text: "yo" });
    expect(msg.from).toBe("a");
    expect(msg.to).toBe("b");
    expect(msg.role).toBe("user");
    expect(msg.parts).toEqual([{ kind: "text", text: "yo" }]);
  });

  it("honors an explicit id and role", () => {
    const msg = makeMessage({
      from: "a",
      to: "b",
      text: "yo",
      id: "fixed-1",
      role: "agent",
    });
    expect(msg.id).toBe("fixed-1");
    expect(msg.role).toBe("agent");
  });

  it("assigns stable, incrementing default ids", () => {
    // Counter is module-level, so assert the delta, not an absolute value.
    const first = makeMessage({ from: "a", to: "b", text: "1" });
    const second = makeMessage({ from: "a", to: "b", text: "2" });

    const n1 = Number(first.id.replace("a2a-", ""));
    const n2 = Number(second.id.replace("a2a-", ""));
    expect(first.id).toMatch(/^a2a-\d+$/);
    expect(n2).toBe(n1 + 1);
  });
});

describe("PORT-A2A-TRANSPORT — the delivery seam below the bus", () => {
  const reply = (to: string, from: string): A2AMessage => makeMessage({ from: to, to: from, text: "ok", role: "agent" });

  it("a networked transport handles a non-local target WITHOUT editing send()", async () => {
    const delivered: string[] = [];
    const remote: DeliveryTransport = {
      deliver: async (m) => { delivered.push(m.to); return reply(m.to, m.from); },
      reaches: () => ["cloud-agent"],
    };
    const bus = new A2ABus(remote);
    bus.register("local-agent", (m) => reply(m.to, m.from));

    // Local target → local delivery (remote not touched).
    await bus.send(makeMessage({ from: "me", to: "local-agent", text: "hi" }));
    expect(delivered).toEqual([]);
    // Unknown-locally target → the injected remote transport handles it.
    const r = await bus.send(makeMessage({ from: "me", to: "cloud-agent", text: "hi" }));
    expect(delivered).toEqual(["cloud-agent"]);
    expect(r?.role).toBe("agent");
  });

  it("list() unions local + remote reach", () => {
    const remote: DeliveryTransport = { deliver: async () => null, reaches: () => ["cloud-a", "cloud-b"] };
    const bus = new A2ABus(remote);
    bus.register("local-a", (m) => reply(m.to, m.from));
    expect(bus.list().sort()).toEqual(["cloud-a", "cloud-b", "local-a"]);
  });

  it("no remote transport + unknown target → the local helpful error (unchanged)", async () => {
    const bus = new A2ABus();
    await expect(bus.send(makeMessage({ from: "me", to: "ghost", text: "?" }))).rejects.toThrow(/no agent registered for "ghost"/);
  });

  it("LocalDelivery is itself a DeliveryTransport (the default adapter)", async () => {
    const local = new LocalDelivery();
    local.register("x", (m) => reply(m.to, m.from));
    expect(local.has("x")).toBe(true);
    expect(local.reaches()).toEqual(["x"]);
    expect((await local.deliver(makeMessage({ from: "me", to: "x", text: "hi" })))?.role).toBe("agent");
  });
});
