import { expect, it, vi } from "vitest";
import { runAcpServer } from "./acp-server.js";
import { SessionManager, type AgentRunner } from "./session.js";

function server(runner: AgentRunner, onSend: (message: any) => void = () => {}) {
  let receive = (_line: string) => {};
  let close = () => {};
  const messages: Array<any> = [];
  const done = runAcpServer({
    send: line => { const message = JSON.parse(line); onSend(message); messages.push(message); },
    onMessage: handler => { receive = handler; },
    onClose: handler => { close = handler; },
  }, { runner, cwd: "/private-fixture" });
  const send = (message: object) => receive(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
  const prompt = (id: number, sessionId: string) => send({ id, method: "session/prompt", params: { sessionId, prompt: [] } });
  const cancel = (sessionId: string) => send({ method: "session/cancel", params: { sessionId } });
  const answer = (id: string, optionId: string) => send({ id, result: { outcome: { outcome: "selected", optionId } } });
  const asks = () => messages.filter(message => message.method === "session/request_permission");
  return { messages, send, prompt, cancel, answer, asks, close, done };
}

it("Cancel settles an unanswered approval and a stale allow cannot arm the next turn", async () => {
  const verdicts: boolean[] = [];
  const s = server(async req => {
    verdicts.push(await req.approve("write file brief.md", "Private edit", "write_file"));
    return { stopReason: "end_turn" };
  });
  try {
    s.send({ id: 1, method: "session/new", params: {} });
    await vi.waitFor(() => expect(s.messages.find(message => message.id === 1)?.result.sessionId).toBeTruthy());
    const sid = s.messages.find(message => message.id === 1).result.sessionId;
    s.prompt(2, sid);
    await vi.waitFor(() => expect(s.asks()).toHaveLength(1));
    s.cancel(sid);
    await vi.waitFor(() => expect(s.messages.find(message => message.id === 2)?.result).toEqual({ stopReason: "cancelled" }));
    expect(verdicts).toEqual([false]);
    s.answer(s.asks()[0].id, "allow_always");
    s.prompt(3, sid);
    await vi.waitFor(() => expect(s.asks()).toHaveLength(2));
    expect(s.messages.find(message => message.id === 3)).toBeUndefined();
    s.answer(s.asks()[1].id, "reject");
    await vi.waitFor(() => expect(s.messages.find(message => message.id === 3)?.result.stopReason).toBe("end_turn"));
    expect(verdicts).toEqual([false, false]);
  } finally { s.close(); await s.done; }
});

it("canceling one session leaves another session's permission pending", async () => {
  const s = server(async req => {
    await req.approve("write file brief.md", "Private edit", "write_file");
    return { stopReason: "end_turn" };
  });
  try {
    for (const id of [1, 2]) s.send({ id, method: "session/new", params: {} });
    await vi.waitFor(() => expect(s.messages.filter(message => message.result?.sessionId)).toHaveLength(2));
    const [first, second] = s.messages.filter(message => message.result?.sessionId).map(message => message.result.sessionId);
    s.prompt(3, first); s.prompt(4, second);
    await vi.waitFor(() => expect(s.asks()).toHaveLength(2));
    s.cancel(first);
    await vi.waitFor(() => expect(s.messages.find(message => message.id === 3)?.result.stopReason).toBe("cancelled"));
    expect(s.messages.find(message => message.id === 4)).toBeUndefined();
    s.answer(s.asks().find(message => message.params.sessionId === second).id, "allow");
    await vi.waitFor(() => expect(s.messages.find(message => message.id === 4)?.result.stopReason).toBe("end_turn"));
  } finally { s.close(); await s.done; }
});

it("does not accept a late session grant from a sink that ignores cancellation", async () => {
  let answer = (_option: string) => {};
  const requests: string[] = [];
  const manager = new SessionManager(async req => {
    expect(await req.approve("write file brief.md", "Private edit", "write_file")).toBe(false);
    return { stopReason: "end_turn" };
  }, { update: () => {}, requestPermission: async id => {
    requests.push(id);
    return new Promise<string>(resolve => { answer = resolve; });
  } }, "/private-fixture");
  const sid = manager.newSession().sessionId;
  const first = manager.prompt(sid, "Private edit");
  manager.cancel(sid); answer("allow_always");
  expect(await first).toEqual({ stopReason: "cancelled" });
  const next = manager.prompt(sid, "Private edit");
  expect(requests).toHaveLength(2);
  answer("reject"); await next;
});

it("asks nothing after cancellation, including when a prior edit grant exists", async () => {
  const requestPermission = vi.fn(async () => "allow_always");
  const manager = new SessionManager(async req => {
    expect(await req.approve("write file first.md", "Private edit", "write_file")).toBe(true);
    manager.cancel(req.sessionId);
    expect(await req.approve("write file later.md", "Private edit", "write_file")).toBe(false);
    expect(await req.approve("Overwrite brief.md", "Private replacement", "write_file", { fresh: true })).toBe(false);
    return { stopReason: "end_turn" };
  }, { update: () => {}, requestPermission }, "/private-fixture");
  expect(await manager.prompt(manager.newSession().sessionId, "Private edit")).toEqual({ stopReason: "cancelled" });
  expect(requestPermission).toHaveBeenCalledOnce();
});

it("does not cancel explicitly detached approval with the foreground turn", async () => {
  let granted: boolean | undefined;
  const s = server(async req => {
    granted = await req.approve("write file background.md", "Private detached edit", "write_file", { signal: null });
    return { stopReason: "end_turn" };
  });
  try {
    s.send({ id: 1, method: "session/new", params: {} });
    await vi.waitFor(() => expect(s.messages.find(message => message.id === 1)?.result.sessionId).toBeTruthy());
    const sid = s.messages.find(message => message.id === 1).result.sessionId;
    s.prompt(2, sid);
    await vi.waitFor(() => expect(s.asks()).toHaveLength(1));
    expect(JSON.stringify(s.asks()[0])).not.toContain("signal");
    s.cancel(sid);
    await Promise.resolve();
    expect(granted).toBeUndefined();
    expect(s.messages.find(message => message.id === 2)).toBeUndefined();
    s.answer(s.asks()[0].id, "allow");
    await vi.waitFor(() => expect(granted).toBe(true));
    expect(s.messages.find(message => message.id === 2)?.result.stopReason).toBe("cancelled");
  } finally { s.close(); await s.done; }
});

it("transport closure settles outstanding permissions as denied", async () => {
  let granted: boolean | undefined;
  const s = server(async req => {
    granted = await req.approve("write file brief.md", "Private edit", "write_file");
    return { stopReason: "end_turn" };
  });
  s.send({ id: 1, method: "session/new", params: {} });
  await vi.waitFor(() => expect(s.messages.find(message => message.id === 1)?.result.sessionId).toBeTruthy());
  s.prompt(2, s.messages.find(message => message.id === 1).result.sessionId);
  await vi.waitFor(() => expect(s.asks()).toHaveLength(1));
  s.close(); await s.done;
  await vi.waitFor(() => expect(granted).toBe(false));
});

it("a failed permission send removes its cancellation listener and reports the error", async () => {
  let removed: ReturnType<typeof vi.spyOn> | undefined;
  const s = server(async req => {
    removed = vi.spyOn(req.signal, "removeEventListener");
    await req.approve("write file brief.md", "Private edit", "write_file");
    return { stopReason: "end_turn" };
  }, message => {
    if (message.method === "session/request_permission") throw new Error("Private transport failure");
  });
  try {
    s.send({ id: 1, method: "session/new", params: {} });
    await vi.waitFor(() => expect(s.messages.find(message => message.id === 1)?.result.sessionId).toBeTruthy());
    const sid = s.messages.find(message => message.id === 1).result.sessionId;
    s.prompt(2, sid);
    await vi.waitFor(() => expect(s.messages.find(message => message.id === 2)?.error.message).toBe("Private transport failure"));
    expect(removed).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
    s.close(); await s.done;
    expect(removed).toHaveBeenCalledOnce();
  } finally { s.close(); await s.done; }
});
