import { describe, it, expect } from "vitest";
import { runAcpServer, buildInitializeResult } from "./acp-server.js";
import type { AcpTransport, AcpServerDeps } from "./acp-server.js";
import type { AgentRunner, RunRequest } from "./session.js";

/**
 * A fake bidirectional transport: tests `push()` inbound lines and read the
 * captured `out` lines. `close()` ends the server. No real stdio.
 */
function fakeTransport(): { transport: AcpTransport; push: (obj: unknown) => void; pushRaw: (line: string) => void; out: string[]; close: () => void } {
  let onMsg: (line: string) => void = () => {};
  let onClose: () => void = () => {};
  const out: string[] = [];
  return {
    transport: {
      send: (line) => out.push(line.trim()),
      onMessage: (cb) => (onMsg = cb),
      onClose: (cb) => (onClose = cb),
    },
    push: (obj) => onMsg(`${JSON.stringify(obj)}\n`),
    pushRaw: (line) => onMsg(line),
    out,
    close: () => onClose(),
  };
}

const sent = (out: string[]) => out.map((l) => JSON.parse(l));
const okRunner: AgentRunner = async () => ({ stopReason: "end_turn" });

function start(runner: AgentRunner = okRunner): ReturnType<typeof fakeTransport> & { done: Promise<void> } {
  const ft = fakeTransport();
  const deps: AcpServerDeps = { runner, cwd: "/repo" };
  const done = runAcpServer(ft.transport, deps);
  return { ...ft, done };
}

describe("ACP server: initialize handshake", () => {
  it("returns the agent capabilities", async () => {
    const s = start();
    s.push({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1 } });
    await tick();
    const res = sent(s.out)[0];
    expect(res).toEqual({ jsonrpc: "2.0", id: 1, result: buildInitializeResult() });
    expect(res.result.agentCapabilities.loadSession).toBe(true);
    s.close();
    await s.done;
  });
});

describe("ACP server: session lifecycle", () => {
  it("session/new returns a sessionId", async () => {
    const s = start();
    s.push({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: "/work" } });
    await tick();
    expect(sent(s.out)[0].result.sessionId).toBeTruthy();
    s.close();
    await s.done;
  });

  it("session/load registers and acks a session id", async () => {
    const s = start();
    s.push({ jsonrpc: "2.0", id: 3, method: "session/load", params: { sessionId: "resume-1" } });
    await tick();
    expect(sent(s.out)[0].result).toEqual({ sessionId: "resume-1" });
    s.close();
    await s.done;
  });

  it("session/set_mode acks and emits a current_mode_update", async () => {
    const s = start();
    const sid = await newSession(s);
    s.push({ jsonrpc: "2.0", id: 5, method: "session/set_mode", params: { sessionId: sid, modeId: "plan" } });
    await tick();
    const msgs = sent(s.out);
    expect(msgs.some((m) => m.method === "session/update" && m.params.update.sessionUpdate === "current_mode_update")).toBe(true);
    s.close();
    await s.done;
  });

  it("session/set_model acks (Vanta resolves the model itself)", async () => {
    const s = start();
    const sid = await newSession(s);
    s.push({ jsonrpc: "2.0", id: 6, method: "session/set_model", params: { sessionId: sid, modelId: "gpt-5" } });
    await tick();
    const ack = sent(s.out).find((m) => m.id === 6);
    expect(ack.result).toEqual({});
    s.close();
    await s.done;
  });
});

describe("ACP server: session/prompt", () => {
  it("drives the fake agent and streams session/update notifications", async () => {
    const runner: AgentRunner = async (req: RunRequest) => {
      req.emit({ type: "text_delta", delta: "answer" });
      return { stopReason: "end_turn" };
    };
    const s = start(runner);
    const sid = await newSession(s);
    s.push({ jsonrpc: "2.0", id: 10, method: "session/prompt", params: { sessionId: sid, prompt: [{ type: "text", text: "hi" }] } });
    await tick();
    const msgs = sent(s.out);
    expect(msgs.some((m) => m.method === "session/update" && m.params.update.sessionUpdate === "agent_message_chunk")).toBe(true);
    const reply = msgs.find((m) => m.id === 10);
    expect(reply.result).toEqual({ stopReason: "end_turn" });
    s.close();
    await s.done;
  });

  it("prompt on an unknown session returns an invalid-params error", async () => {
    const s = start();
    s.push({ jsonrpc: "2.0", id: 11, method: "session/prompt", params: { sessionId: "ghost", prompt: [] } });
    await tick();
    const err = sent(s.out).find((m) => m.id === 11).error;
    expect(err.code).toBe(-32602);
    s.close();
    await s.done;
  });
});

describe("ACP server: request_permission round-trip", () => {
  it("issues session/request_permission and resolves the runner with the client's choice", async () => {
    let granted: boolean | undefined;
    const runner: AgentRunner = async (req: RunRequest) => {
      granted = await req.approve("write", "write a file", "write_file");
      return { stopReason: "end_turn" };
    };
    const s = start(runner);
    const sid = await newSession(s);
    s.push({ jsonrpc: "2.0", id: 20, method: "session/prompt", params: { sessionId: sid, prompt: [{ type: "text", text: "go" }] } });
    await tick();
    const ask = sent(s.out).find((m) => m.method === "session/request_permission");
    expect(ask).toBeTruthy();
    expect(ask.params.options.map((o: { optionId: string }) => o.optionId)).toEqual(["allow", "reject"]);
    // client answers: selected the allow option
    s.push({ jsonrpc: "2.0", id: ask.id, result: { outcome: { outcome: "selected", optionId: "allow" } } });
    await tick();
    expect(granted).toBe(true);
    s.close();
    await s.done;
  });

  it("a cancelled permission outcome denies the action", async () => {
    let granted: boolean | undefined;
    const runner: AgentRunner = async (req: RunRequest) => {
      granted = await req.approve("push", "git push", "git_push");
      return { stopReason: "end_turn" };
    };
    const s = start(runner);
    const sid = await newSession(s);
    s.push({ jsonrpc: "2.0", id: 21, method: "session/prompt", params: { sessionId: sid, prompt: [{ type: "text", text: "push" }] } });
    await tick();
    const ask = sent(s.out).find((m) => m.method === "session/request_permission");
    s.push({ jsonrpc: "2.0", id: ask.id, result: { outcome: { outcome: "cancelled" } } });
    await tick();
    expect(granted).toBe(false);
    s.close();
    await s.done;
  });
});

describe("ACP server: cancel + errors", () => {
  it("session/cancel notification aborts the in-flight prompt", async () => {
    const runner: AgentRunner = (req: RunRequest) =>
      new Promise((resolve) => req.signal.addEventListener("abort", () => resolve({ stopReason: "end_turn" })));
    const s = start(runner);
    const sid = await newSession(s);
    s.push({ jsonrpc: "2.0", id: 30, method: "session/prompt", params: { sessionId: sid, prompt: [{ type: "text", text: "long" }] } });
    await tick();
    s.push({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId: sid } });
    await tick();
    const reply = sent(s.out).find((m) => m.id === 30);
    expect(reply.result).toEqual({ stopReason: "cancelled" });
    s.close();
    await s.done;
  });

  it("malformed JSON-RPC returns a parse-error response", async () => {
    const ft = fakeTransport();
    const done = runAcpServer(ft.transport, { runner: okRunner, cwd: "/repo" });
    ft.pushRaw("{ this is not json\n");
    await tick();
    const err = sent(ft.out)[0];
    expect(err.error.code).toBe(-32700);
    expect(err.id).toBeNull();
    ft.close();
    await done;
  });

  it("an unknown method returns method-not-found", async () => {
    const s = start();
    s.push({ jsonrpc: "2.0", id: 40, method: "session/teleport", params: {} });
    await tick();
    expect(sent(s.out).find((m) => m.id === 40).error.code).toBe(-32601);
    s.close();
    await s.done;
  });

  it("a runner that throws yields an internal-error response (no crash)", async () => {
    const runner: AgentRunner = async () => {
      throw new Error("provider exploded");
    };
    const s = start(runner);
    const sid = await newSession(s);
    s.push({ jsonrpc: "2.0", id: 50, method: "session/prompt", params: { sessionId: sid, prompt: [] } });
    await tick();
    const err = sent(s.out).find((m) => m.id === 50).error;
    expect(err.code).toBe(-32603);
    expect(err.message).toContain("provider exploded");
    s.close();
    await s.done;
  });
});

async function newSession(s: { push: (o: unknown) => void; out: string[] }): Promise<string> {
  s.push({ jsonrpc: "2.0", id: 1000 + s.out.length, method: "session/new", params: {} });
  await tick();
  const created = sent(s.out).filter((m) => m.result?.sessionId).at(-1);
  return created.result.sessionId as string;
}

/** Let queued microtasks flush. */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
