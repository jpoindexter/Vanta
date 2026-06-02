import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSlashCommand, type ReplCtx } from "./repl-commands.js";
import { saveSession } from "./sessions/store.js";
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
