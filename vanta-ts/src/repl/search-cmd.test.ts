import { describe, it, expect } from "vitest";
import { search } from "./search-cmd.js";
import type { ReplCtx, SlashResult } from "./types.js";
import type { Message } from "../types.js";
import type { AgentOutcome } from "../agent.js";

const STUB_OUTCOME: AgentOutcome = {
  finalText: "",
  iterations: 0,
  stoppedReason: "done",
  toolIterations: 0,
};

// Minimal stub for ReplCtx — search only reads ctx.convo.messages.
function makeCtx(messages: Message[]): ReplCtx {
  return {
    convo: {
      messages,
      send: async () => STUB_OUTCOME,
      setProvider: () => {},
      setSessionMemory: () => {},
    },
    setup: {} as ReplCtx["setup"],
    dataDir: "/tmp/.vanta",
    state: {
      sessionId: "test",
      started: new Date().toISOString(),
      turnIndex: 0,
    },
    env: {},
    now: () => new Date(),
  };
}

async function run(arg: string, ctx: ReplCtx): Promise<SlashResult> {
  return search(arg, ctx);
}

const SYSTEM: Message = { role: "system", content: "You are Vanta." };

describe("search handler", () => {
  it("returns empty-history message when no non-system messages exist", async () => {
    const ctx = makeCtx([SYSTEM]);
    const result = await run("", ctx);
    expect(result).toMatchObject({ output: expect.stringContaining("no conversation history yet") });
  });

  it("returns last-N recap when called with no query", async () => {
    const msgs: Message[] = [
      SYSTEM,
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ];
    const ctx = makeCtx(msgs);
    const result = await run("", ctx);
    expect(result).toMatchObject({ output: expect.stringContaining("[turn 1] user: hello") });
    expect(result).toMatchObject({ output: expect.stringContaining("[turn 2] assistant: hi there") });
  });

  it("finds a matching turn with a query", async () => {
    const msgs: Message[] = [
      SYSTEM,
      { role: "user", content: "tell me about rust" },
      { role: "assistant", content: "Rust is a systems language." },
      { role: "user", content: "what about python?" },
    ];
    const ctx = makeCtx(msgs);
    const result = await run("rust", ctx);
    // Both user ("tell me about rust") and assistant ("Rust is a systems…") match.
    expect(result).toMatchObject({ output: expect.stringContaining("2 match") });
    expect(result).toMatchObject({ output: expect.stringContaining("[turn 1] user") });
    expect(result).toMatchObject({ output: expect.stringContaining("[turn 2] assistant") });
    // The python turn should not appear.
    expect(result.output).not.toContain("python");
  });

  it("returns not-found message when query has no matches", async () => {
    const msgs: Message[] = [
      SYSTEM,
      { role: "user", content: "hello world" },
      { role: "assistant", content: "hey!" },
    ];
    const ctx = makeCtx(msgs);
    const result = await run("zzz-no-match", ctx);
    expect(result).toMatchObject({ output: expect.stringContaining('no matches for "zzz-no-match"') });
  });

  it("query is case-insensitive", async () => {
    const msgs: Message[] = [
      SYSTEM,
      { role: "user", content: "HELLO there" },
    ];
    const ctx = makeCtx(msgs);
    const result = await run("hello", ctx);
    expect(result).toMatchObject({ output: expect.stringContaining("[turn 1] user") });
  });
});
