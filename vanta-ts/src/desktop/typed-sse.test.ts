import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDeps, StreamEvent } from "../agent.js";
import { eventLabel } from "./handler-conversation.js";
import type { DesktopState } from "./handler-state.js";
import { freshState, headers, openSse, startServer, typedOf, type SseProbe, type TestServer } from "./__fixtures__/sse-harness.js";

type Send = (text: string, deps: AgentDeps) => Promise<{ finalText: string; iterations: number; stoppedReason: string; toolIterations: number; usage?: { inputTokens: number; outputTokens: number } }>;
const hoisted = vi.hoisted(() => ({ sends: new Map<string, (text: string, deps: AgentDeps) => Promise<unknown>>() }));

// Only createConversation is faked: attachConversation, onEvent wiring, SSE, approval and chat handlers are real.
vi.mock("../agent.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../agent.js")>()),
  createConversation: (_system: string, deps: AgentDeps) => ({
    messages: [{ role: "system", content: "" }],
    send: (text: string) => hoisted.sends.get(deps.sessionId ?? "")!(text, deps),
    setProvider: () => undefined, setSessionMemory: () => undefined,
  }),
}));

let home: string; let root: string; let server: TestServer; const probes: SseProbe[] = [];
const originalHome = process.env.VANTA_HOME;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-typed-home-")); root = await mkdtemp(join(tmpdir(), "vanta-typed-root-"));
  process.env.VANTA_HOME = home;
});
afterEach(async () => {
  probes.splice(0).forEach((probe) => probe.close());
  await server?.close();
  hoisted.sends.clear();
  if (originalHome === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = originalHome;
  await Promise.all([rm(home, { recursive: true, force: true }), rm(root, { recursive: true, force: true })]);
});

const onSend = (id: string, send: Send) => hoisted.sends.set(id, send);
const done = (finalText: string, extra: object = {}) => ({ finalText, iterations: 1, stoppedReason: "done", toolIterations: 0, ...extra });

async function boot(ids: string[]): Promise<Map<string, DesktopState>> {
  const sessions = new Map(ids.map((id) => [id, freshState(id, root)] as const));
  server = await startServer(root, sessions);
  return sessions;
}

async function chat(id: string, message: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`http://127.0.0.1:${server.port}/api/chat`, {
    method: "POST", headers: headers(id), body: JSON.stringify({ message, sessionId: id }),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

async function listen(id: string): Promise<SseProbe> {
  const probe = await openSse(server.port, id);
  probes.push(probe);
  return probe;
}

describe("typed desktop SSE events over a real server", () => {
  it("pairs tool.start/tool.complete by id, keeps label frames, and ends with turn.complete", async () => {
    const script: StreamEvent[] = [
      { type: "thinking", text: "plan the read" },
      { type: "tool_start", name: "read_file", args: { path: "a.ts", token: "hunter2-secret" } },
      { type: "tool_end", name: "read_file", ok: true, output: "contents of a" },
      { type: "tool_start", name: "shell_cmd", args: { command: "ls" } },
      { type: "tool_end", name: "shell_cmd", ok: false, output: "boom" },
      { type: "tool_start", name: "read_file", args: { path: "b.ts" } },
      { type: "tool_start", name: "read_file", args: { path: "c.ts" } },
      { type: "tool_end", name: "read_file", ok: true, output: "contents of b" },
      { type: "tool_end", name: "read_file", ok: true, output: "contents of c" },
      { type: "note", text: "just a note" },
    ];
    onSend("chat-1", async (_text, deps) => { script.forEach((event) => deps.onEvent?.(event)); return done("all done", { usage: { inputTokens: 5, outputTokens: 7 } }); });
    await boot(["chat-1"]);
    const sse = await listen("chat-1");
    const { status, body } = await chat("chat-1", "go");
    expect(status).toBe(200);
    await sse.waitFor((frame) => frame.typed?.type === "turn.complete");

    expect(typedOf(sse.frames)).toEqual([
      { type: "thinking", text: "plan the read", truncated: false },
      { type: "tool.start", id: "tool-1", name: "read_file", args: { path: "a.ts", token: "***" }, truncated: false },
      { type: "tool.complete", id: "tool-1", name: "read_file", ok: true, output: "contents of a", truncated: false },
      { type: "tool.start", id: "tool-2", name: "shell_cmd", args: { command: "ls" }, truncated: false },
      { type: "tool.complete", id: "tool-2", name: "shell_cmd", ok: false, output: "boom", truncated: false },
      { type: "tool.start", id: "tool-3", name: "read_file", args: { path: "b.ts" }, truncated: false },
      { type: "tool.start", id: "tool-4", name: "read_file", args: { path: "c.ts" }, truncated: false },
      { type: "tool.complete", id: "tool-3", name: "read_file", ok: true, output: "contents of b", truncated: false },
      { type: "tool.complete", id: "tool-4", name: "read_file", ok: true, output: "contents of c", truncated: false },
      { type: "turn.complete", sessionId: "chat-1", finalText: "all done", usage: { inputTokens: 5, outputTokens: 7 }, stoppedReason: "done" },
    ]);
    expect(JSON.stringify(sse.frames)).not.toContain("hunter2-secret");
    // Frames (and the POST body) are strictly ordered: the turn.complete frame is last.
    expect(sse.frames.at(-1)?.typed?.type).toBe("turn.complete");
    expect(body).toMatchObject({ finalText: "all done", sessionId: "chat-1" });
  });

  it("leaves the legacy label contract unchanged (frames minus typed, and the POST events array)", async () => {
    const script: StreamEvent[] = [
      { type: "tool_start", name: "read_file", args: { path: "a.ts" } },
      { type: "tool_end", name: "read_file", ok: true, output: "out" },
      { type: "note", text: "n" },
    ];
    onSend("chat-1", async (_text, deps) => { script.forEach((event) => deps.onEvent?.(event)); return done("fin"); });
    await boot(["chat-1"]);
    const sse = await listen("chat-1");
    const { body } = await chat("chat-1", "go");
    await sse.waitFor((frame) => frame.typed?.type === "turn.complete");

    const expectedLabels = script.map((event) => eventLabel(event));
    expect(expectedLabels[0]).toEqual({ label: "→ read_file", kind: "tool_start", name: "read_file" });
    const labelled = sse.frames.filter((frame) => frame.label).map(({ typed: _typed, ...legacy }) => legacy);
    expect(labelled).toEqual(expectedLabels);
    // Typed-only frames carry an empty label, which the existing renderer ignores (`else if (event.label)`).
    expect(sse.frames.filter((frame) => !frame.label).every((frame) => frame.typed && frame.delta === undefined)).toBe(true);
    const postEvents = body.events as Array<Record<string, unknown>>;
    expect(postEvents.slice(0, 3)).toEqual(expectedLabels);
    expect(postEvents.some((event) => "typed" in event)).toBe(false);
  });

  it("pushes approval.request on request and approval.resolved on resolve, while polling still works", async () => {
    onSend("chat-1", async (_text, deps) => {
      deps.onEvent?.({ type: "tool_start", name: "shell_cmd", args: { command: "ls" } });
      const approved = await deps.requestApproval("run shell command: ls", "needs approval", "shell_cmd");
      deps.onEvent?.({ type: "tool_end", name: "shell_cmd", ok: approved, output: approved ? "listed" : "denied" });
      return done(approved ? "approved" : "denied");
    });
    const sessions = await boot(["chat-1"]);
    const sse = await listen("chat-1");
    const turn = chat("chat-1", "go");
    const requested = await sse.waitFor((frame) => frame.typed?.type === "approval.request");

    const polled = await (await fetch(`http://127.0.0.1:${server.port}/api/approval`, { headers: headers("chat-1") })).json();
    expect(polled).toEqual((requested.typed as unknown as { approval: unknown }).approval);
    expect(polled).toMatchObject({ action: "run shell command: ls", toolName: "shell_cmd", request: { kind: "bash", subject: "ls" } });

    const decision = await fetch(`http://127.0.0.1:${server.port}/api/approval`, {
      method: "POST", headers: headers("chat-1"), body: JSON.stringify({ id: (polled as { id: string }).id, decision: "allow" }),
    });
    expect(decision.status).toBe(200);
    expect((await turn).body).toMatchObject({ finalText: "approved" });
    await sse.waitFor((frame) => frame.typed?.type === "turn.complete");

    const kinds = typedOf(sse.frames).map((event) => event.type);
    expect(kinds).toEqual(["tool.start", "approval.request", "approval.resolved", "tool.complete", "turn.complete"]);
    expect(typedOf(sse.frames)[2]).toEqual({ type: "approval.resolved", id: (polled as { id: string }).id });
    expect(sessions.get("chat-1")?.pendingApproval).toBeUndefined();
    expect(await (await fetch(`http://127.0.0.1:${server.port}/api/approval`, { headers: headers("chat-1") })).json()).toBeNull();
  });

  it("reports an interrupted turn through turn.complete with the stopped reason", async () => {
    onSend("chat-1", async () => done("Stopped.", { stoppedReason: "interrupted" }));
    await boot(["chat-1"]);
    const sse = await listen("chat-1");
    await chat("chat-1", "go");
    const complete = await sse.waitFor((frame) => frame.typed?.type === "turn.complete");
    expect(complete.typed).toEqual({ type: "turn.complete", sessionId: "chat-1", finalText: "Stopped.", stoppedReason: "interrupted" });
  });

  it("emits turn.complete when provider authentication is required", async () => {
    const sessions = await boot(["chat-1"]);
    sessions.get("chat-1")!._providerAuthRequired = { provider: "codex", model: "m", baseRoute: "provider://codex", billingMode: "included", authMethod: "subscription" };
    const sse = await listen("chat-1");
    const { status, body } = await chat("chat-1", "go");
    expect(status).toBe(200);
    const complete = await sse.waitFor((frame) => frame.typed?.type === "turn.complete");
    expect(complete.typed).toMatchObject({ type: "turn.complete", sessionId: "chat-1", stoppedReason: "provider_auth", finalText: body.finalText });
  });

  it("emits turn.complete from the failure path when the agent throws", async () => {
    onSend("chat-1", async () => { throw new Error("provider exploded"); });
    await boot(["chat-1"]);
    const sse = await listen("chat-1");
    const { status } = await chat("chat-1", "go");
    expect(status).toBe(200);
    const complete = await sse.waitFor((frame) => frame.typed?.type === "turn.complete");
    expect(complete.typed).toMatchObject({ type: "turn.complete", sessionId: "chat-1", finalText: "provider exploded", stoppedReason: "failed" });
  });
});

describe("two clients with distinct x-session-id", () => {
  it("run chats concurrently without 409 and never receive each other's events", async () => {
    const gate = { started: 0, release: () => undefined as void, wait: undefined as unknown as Promise<void> };
    gate.wait = new Promise<void>((resolve) => { gate.release = resolve; });
    const sendFor = (tool: string, reply: string): Send => async (_text, deps) => {
      deps.onEvent?.({ type: "tool_start", name: tool, args: { who: reply } });
      if (++gate.started === 2) gate.release();
      await gate.wait; // both turns are provably in flight at once before either finishes
      deps.onEvent?.({ type: "tool_end", name: tool, ok: true, output: `${tool} output` });
      return done(reply);
    };
    onSend("chat-a", sendFor("read_file", "reply A"));
    onSend("chat-b", sendFor("shell_cmd", "reply B"));
    const sessions = await boot(["chat-a", "chat-b"]);
    const [a, b] = [await listen("chat-a"), await listen("chat-b")];

    const [ra, rb] = await Promise.all([chat("chat-a", "hello a"), chat("chat-b", "hello b")]);
    expect([ra.status, rb.status]).toEqual([200, 200]);
    expect(ra.body).toMatchObject({ finalText: "reply A", sessionId: "chat-a" });
    expect(rb.body).toMatchObject({ finalText: "reply B", sessionId: "chat-b" });
    await Promise.all([a.waitFor((f) => f.typed?.type === "turn.complete"), b.waitFor((f) => f.typed?.type === "turn.complete")]);

    expect(typedOf(a.frames)).toEqual([
      { type: "tool.start", id: "tool-1", name: "read_file", args: { who: "reply A" }, truncated: false },
      { type: "tool.complete", id: "tool-1", name: "read_file", ok: true, output: "read_file output", truncated: false },
      { type: "turn.complete", sessionId: "chat-a", finalText: "reply A", stoppedReason: "done" },
    ]);
    expect(typedOf(b.frames)).toEqual([
      { type: "tool.start", id: "tool-1", name: "shell_cmd", args: { who: "reply B" }, truncated: false },
      { type: "tool.complete", id: "tool-1", name: "shell_cmd", ok: true, output: "shell_cmd output", truncated: false },
      { type: "turn.complete", sessionId: "chat-b", finalText: "reply B", stoppedReason: "done" },
    ]);
    expect(JSON.stringify(a.frames)).not.toContain("shell_cmd");
    expect(JSON.stringify(b.frames)).not.toContain("read_file");
    expect(sessions.get("chat-a")).not.toBe(sessions.get("chat-b"));
  });

  it("scopes an approval request to the client that owns the turn", async () => {
    onSend("chat-a", async (_t, deps) => { await deps.requestApproval("run shell command: ls", "r", "shell_cmd"); return done("A"); });
    onSend("chat-b", async () => done("B"));
    await boot(["chat-a", "chat-b"]);
    const [a, b] = [await listen("chat-a"), await listen("chat-b")];
    const turn = chat("chat-a", "go");
    const requested = await a.waitFor((f) => f.typed?.type === "approval.request");
    const id = (requested.typed as unknown as { approval: { id: string } }).approval.id;
    expect((await (await fetch(`http://127.0.0.1:${server.port}/api/approval`, { headers: headers("chat-b") })).json())).toBeNull();
    await fetch(`http://127.0.0.1:${server.port}/api/approval`, { method: "POST", headers: headers("chat-a"), body: JSON.stringify({ id, decision: "deny" }) });
    await turn;
    await a.waitFor((f) => f.typed?.type === "turn.complete");
    expect(typedOf(b.frames)).toEqual([]);
  });
});
