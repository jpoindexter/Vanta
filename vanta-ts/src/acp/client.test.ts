import { describe, it, expect } from "vitest";
import { AcpClient, runAcpClientSession, type AcpClientTransport, type AcpUpdate } from "./client.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

/** A controllable transport: captures sent lines, lets a test inject inbound lines. */
class FakeTransport implements AcpClientTransport {
  sent: string[] = [];
  private msgCb?: (line: string) => void;
  private closeCb?: () => void;
  send(line: string) { this.sent.push(line); }
  onMessage(cb: (line: string) => void) { this.msgCb = cb; }
  onClose(cb: () => void) { this.closeCb = cb; }
  close() { this.closeCb?.(); }
  inject(obj: unknown) { this.msgCb?.(`${JSON.stringify(obj)}\n`); }
  last() { return JSON.parse(this.sent[this.sent.length - 1]!); }
}

/** A mini ACP agent that auto-responds + streams one update per prompt. */
class AutoPeer implements AcpClientTransport {
  sent: string[] = [];
  private msgCb?: (line: string) => void;
  private closeCb?: () => void;
  send(line: string) {
    this.sent.push(line);
    const m = JSON.parse(line) as { id?: number; method: string };
    if (m.id === undefined) return; // notification
    queueMicrotask(() => this.respond(m as { id: number; method: string }));
  }
  private respond(m: { id: number; method: string }) {
    if (m.method === "initialize") return this.reply(m.id, { protocolVersion: 1 });
    if (m.method === "session/new") return this.reply(m.id, { sessionId: "s1" });
    if (m.method === "session/prompt") {
      this.emit({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "s1", update: { type: "agent_message_chunk", text: "hi" } } });
      this.reply(m.id, { stopReason: "end_turn" });
    }
  }
  private reply(id: number, result: unknown) { this.emit({ jsonrpc: "2.0", id, result }); }
  private emit(obj: unknown) { this.msgCb?.(`${JSON.stringify(obj)}\n`); }
  onMessage(cb: (line: string) => void) { this.msgCb = cb; }
  onClose(cb: () => void) { this.closeCb = cb; }
  close() { this.closeCb?.(); }
}

describe("AcpClient — request/response", () => {
  it("initialize + session/new + prompt round-trip", async () => {
    const t = new FakeTransport();
    const c = new AcpClient({ transport: t });
    const initP = c.initialize();
    t.inject({ jsonrpc: "2.0", id: t.last().id, result: { protocolVersion: 1 } });
    await expect(initP).resolves.toMatchObject({ protocolVersion: 1 });

    const sessP = c.newSession("/tmp");
    t.inject({ jsonrpc: "2.0", id: t.last().id, result: { sessionId: "abc" } });
    expect(await sessP).toBe("abc");

    const pP = c.prompt("abc", "hello");
    expect(t.last().method).toBe("session/prompt");
    t.inject({ jsonrpc: "2.0", id: t.last().id, result: { stopReason: "end_turn" } });
    expect(await pP).toEqual({ stopReason: "end_turn" });
  });

  it("forwards session/update notifications to onUpdate", async () => {
    const updates: AcpUpdate[] = [];
    const t = new FakeTransport();
    const c = new AcpClient({ transport: t, onUpdate: (u) => updates.push(u) });
    const session = c.newSession("/tmp");
    t.inject({ jsonrpc: "2.0", id: t.last().id, result: { sessionId: "s1" } });
    await session;
    t.inject({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "s1", update: { type: "agent_message_chunk", text: "yo" } } });
    await tick();
    expect(updates).toHaveLength(1);
    expect(updates[0]!.sessionId).toBe("s1");
  });

  it("drops updates for a session the client did not open", async () => {
    const updates: AcpUpdate[] = [];
    const t = new FakeTransport();
    const c = new AcpClient({ transport: t, onUpdate: (u) => updates.push(u) });
    const session = c.newSession("/tmp");
    t.inject({ jsonrpc: "2.0", id: t.last().id, result: { sessionId: "owned" } });
    await session;

    t.inject({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "other", update: { type: "agent_message_chunk", text: "wrong session" } } });
    t.inject({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "owned", update: { type: "agent_message_chunk", text: "right session" } } });
    await tick();

    expect(updates).toEqual([{ sessionId: "owned", update: { type: "agent_message_chunk", text: "right session" } }]);
  });

  it("rejects pending requests when the transport closes", async () => {
    const t = new FakeTransport();
    const c = new AcpClient({ transport: t });
    const p = c.initialize();
    t.close();
    await expect(p).rejects.toThrow(/closed/);
  });
});

describe("AcpClient — kernel-routed permission requests", () => {
  it("approves with an allow option when the approver says yes", async () => {
    const t = new FakeTransport();
    let seen = "";
    const c = new AcpClient({ transport: t, approve: async (_s, req) => { seen = String((req.toolCall as { title?: string })?.title ?? ""); return true; } });
    const session = c.newSession("/tmp");
    t.inject({ jsonrpc: "2.0", id: t.last().id, result: { sessionId: "s1" } });
    await session;
    t.inject({
      jsonrpc: "2.0", id: "perm-1", method: "session/request_permission",
      params: { sessionId: "s1", toolCall: { title: "write /etc/x" }, options: [{ optionId: "allow_once", kind: "allow_once" }, { optionId: "reject_once", kind: "reject_once" }] },
    });
    await tick();
    expect(seen).toBe("write /etc/x");
    expect(t.last().result.outcome).toEqual({ outcome: "selected", optionId: "allow_once" });
  });

  it("rejects with a reject option when the approver (kernel) says no", async () => {
    const t = new FakeTransport();
    const c = new AcpClient({ transport: t, approve: async () => false });
    const session = c.newSession("/tmp");
    t.inject({ jsonrpc: "2.0", id: t.last().id, result: { sessionId: "s1" } });
    await session;
    t.inject({
      jsonrpc: "2.0", id: "perm-2", method: "session/request_permission",
      params: { sessionId: "s1", options: [{ optionId: "allow_once", kind: "allow_once" }, { optionId: "reject_once", kind: "reject_once" }] },
    });
    await tick();
    expect(t.last().result.outcome.optionId).toBe("reject_once");
  });

  it("rejects permission requests for a session the client did not open", async () => {
    const t = new FakeTransport();
    const approvals: string[] = [];
    const c = new AcpClient({ transport: t, approve: async (sessionId) => { approvals.push(sessionId); return true; } });
    const session = c.newSession("/tmp");
    t.inject({ jsonrpc: "2.0", id: t.last().id, result: { sessionId: "owned" } });
    await session;

    t.inject({
      jsonrpc: "2.0", id: "cross-session", method: "session/request_permission",
      params: { sessionId: "other", options: [{ optionId: "allow_once", kind: "allow_once" }, { optionId: "reject_once", kind: "reject_once" }] },
    });
    await tick();

    expect(approvals).toEqual([]);
    expect(t.last().result.outcome.optionId).toBe("reject_once");
  });
});

describe("runAcpClientSession — full multi-turn drive", () => {
  it("initializes, opens a session, runs each prompt, streams an update per turn", async () => {
    const updates: AcpUpdate[] = [];
    const r = await runAcpClientSession({ transport: new AutoPeer(), cwd: "/tmp", prompts: ["a", "b"], onUpdate: (u) => updates.push(u) });
    expect(r.sessionId).toBe("s1");
    expect(r.turns).toEqual([
      { prompt: "a", stopReason: "end_turn" },
      { prompt: "b", stopReason: "end_turn" },
    ]);
    expect(updates).toHaveLength(2);
  });
});
