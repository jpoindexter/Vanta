import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSlashCommand, executeSlash, formatHistory, type ReplCtx } from "./repl-commands.js";
import { saveSession, loadSession } from "./sessions/store.js";
import type { Message } from "./types.js";

function makeCtx(home: string, messages: Message[]): ReplCtx {
  return {
    convo: { messages, send: async () => ({ finalText: "", iterations: 0, stoppedReason: "done", toolIterations: 0 }) },
    setup: {
      registry: { schemas: () => [{ name: "read_file", description: "", parameters: {} }, { name: "shell_cmd", description: "", parameters: {} }] },
      provider: { modelId: () => "gpt-4o-mini", contextWindow: () => 128_000 },
      safety: { getGoals: async () => [] },
      goals: [],
      systemPrompt: "sys",
    },
    dataDir: join(home, ".argo-data"),
    state: { sessionId: "s1", started: "t0", turnIndex: 5 },
    env: { ARGO_HOME: home } as NodeJS.ProcessEnv,
    now: () => new Date("2026-06-02T00:00:00.000Z"),
  } as unknown as ReplCtx;
}

describe("runSlashCommand", () => {
  let home: string;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "argo-repl-"));
    log = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(async () => {
    log.mockRestore();
    await rm(home, { recursive: true, force: true });
  });

  it("/exit and /quit return true (leave the loop)", async () => {
    expect(await runSlashCommand("/exit", makeCtx(home, []))).toBe(true);
    expect(await runSlashCommand("/quit", makeCtx(home, []))).toBe(true);
  });

  it("/help prints and stays in the loop", async () => {
    expect(await runSlashCommand("/help", makeCtx(home, []))).toBe(false);
    expect(log.mock.calls.flat().join("\n")).toContain("/resume");
  });

  it("/clear drops history (keeps system) and resets the turn counter", async () => {
    const messages: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "yo" },
    ];
    const ctx = makeCtx(home, messages);
    const exit = await runSlashCommand("/clear", ctx);
    expect(exit).toBe(false);
    expect(messages).toEqual([{ role: "system", content: "sys" }]);
    expect(ctx.state.turnIndex).toBe(0);
  });

  it("/tools and /model surface registry + provider info", async () => {
    await runSlashCommand("/tools", makeCtx(home, []));
    await runSlashCommand("/model", makeCtx(home, []));
    const out = log.mock.calls.flat().join("\n");
    expect(out).toContain("read_file");
    expect(out).toContain("gpt-4o-mini");
  });

  it("/resume loads a saved session into the conversation", async () => {
    const saved: Message[] = [
      { role: "system", content: "old-sys" },
      { role: "user", content: "first" },
      { role: "assistant", content: "reply" },
      { role: "user", content: "second" },
    ];
    await saveSession("20260601-101010", saved, { env: { ARGO_HOME: home } as NodeJS.ProcessEnv });

    const live: Message[] = [{ role: "system", content: "sys" }];
    const ctx = makeCtx(home, live);
    const exit = await runSlashCommand("/resume 20260601-101010", ctx);
    expect(exit).toBe(false);
    // system kept (the live one), prior non-system turns appended
    expect(live[0]).toEqual({ role: "system", content: "sys" });
    expect(live.filter((m) => m.role === "user")).toHaveLength(2);
    expect(ctx.state.sessionId).toBe("20260601-101010");
    expect(ctx.state.turnIndex).toBe(2);
  });

  it("unknown commands are reported, not sent to the model", async () => {
    expect(await runSlashCommand("/bogus", makeCtx(home, []))).toBe(false);
    expect(log.mock.calls.flat().join("\n")).toContain("unknown command /bogus");
  });
});

describe("conversation commands (history / retry / undo / reset)", () => {
  let home: string;
  const convo = (): Message[] => [
    { role: "system", content: "sys" },
    { role: "user", content: "first" },
    { role: "assistant", content: "reply one" },
    { role: "user", content: "second" },
    { role: "assistant", content: "reply two" },
  ];

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "argo-repl-"));
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("/history renders the transcript without the system message", async () => {
    const r = await executeSlash("/history", makeCtx(home, convo()));
    expect(r.output).toContain("you  › first");
    expect(r.output).toContain("argo › reply one");
    expect(r.output).toContain("you  › second");
    expect(r.output).not.toContain("sys");
  });

  it("/history on an empty conversation says so", async () => {
    const r = await executeSlash("/history", makeCtx(home, [{ role: "system", content: "sys" }]));
    expect(r.output).toContain("no history");
  });

  it("/retry drops the last turn, resends the last user text, decrements turnIndex", async () => {
    const ctx = makeCtx(home, convo());
    const r = await executeSlash("/retry", ctx);
    expect(r.resend).toBe("second");
    expect(ctx.convo.messages).toHaveLength(3); // system + first user + its reply
    expect(ctx.convo.messages.at(-1)).toMatchObject({ role: "assistant", content: "reply one" });
    expect(ctx.state.turnIndex).toBe(4); // was 5
  });

  it("/retry with no user turns is a no-op", async () => {
    const ctx = makeCtx(home, [{ role: "system", content: "sys" }]);
    const r = await executeSlash("/retry", ctx);
    expect(r.resend).toBeUndefined();
    expect(r.output).toContain("nothing to retry");
  });

  it("/undo drops the last turn without resending", async () => {
    const ctx = makeCtx(home, convo());
    const r = await executeSlash("/undo", ctx);
    expect(r.resend).toBeUndefined();
    expect(ctx.convo.messages).toHaveLength(3);
    expect(ctx.state.turnIndex).toBe(4);
  });

  it("/reset clears history but keeps the system message", async () => {
    const ctx = makeCtx(home, convo());
    const r = await executeSlash("/reset", ctx);
    expect(r.cleared).toBe(true);
    expect(ctx.convo.messages).toHaveLength(1);
    expect(ctx.convo.messages[0]).toMatchObject({ role: "system" });
  });

  it("formatHistory is pure and skips system", () => {
    const out = formatHistory(convo());
    expect(out.split("\n")).toHaveLength(4); // 2 user + 2 assistant
  });

  it("/title sets and persists the session title", async () => {
    const ctx = makeCtx(home, convo());
    const r = await executeSlash("/title Parity work", ctx);
    expect(r.output).toContain("Parity work");
    expect(ctx.state.title).toBe("Parity work");
    const saved = await loadSession(ctx.state.sessionId, ctx.env);
    expect(saved?.title).toBe("Parity work");
  });

  it("/title with no name shows usage", async () => {
    const r = await executeSlash("/title", makeCtx(home, convo()));
    expect(r.output).toContain("usage:");
  });

  it("/fork branches into a new session id, preserving history", async () => {
    const ctx = makeCtx(home, convo());
    const original = ctx.state.sessionId;
    const r = await executeSlash("/fork", ctx);
    expect(r.output).toContain("forked");
    expect(ctx.state.sessionId).not.toBe(original);
    expect(ctx.convo.messages).toHaveLength(5); // history carried into the fork
    const forked = await loadSession(ctx.state.sessionId, ctx.env);
    expect(forked?.messages).toHaveLength(5);
  });
});
