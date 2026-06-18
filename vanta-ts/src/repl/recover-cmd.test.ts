import { describe, expect, it } from "vitest";
import { classifyRecovery, formatRecovery, recover } from "./recover-cmd.js";
import type { Message } from "../types.js";
import type { ReplCtx } from "./types.js";

describe("classifyRecovery", () => {
  it("classifies concrete tool failures as targeted bugs", () => {
    const messages = msgs({ role: "tool", toolCallId: "1", name: "x", content: "vitest failed with TypeError" });
    expect(classifyRecovery(messages).kind).toBe("targeted-bug");
    expect(classifyRecovery(messages).action).toBe("debug");
  });

  it("classifies stale contradictory context as polluted context", () => {
    const messages = msgs({ role: "user", content: "The transcript is polluted and you lost track; compact or restart." });
    const diagnosis = classifyRecovery(messages);
    expect(diagnosis.kind).toBe("polluted-context");
    expect(diagnosis.action).toBe("compact-or-restart");
  });

  it("classifies corrected premises as wrong assumptions", () => {
    const messages = msgs({ role: "user", content: "Wrong assumption: that is not what I asked. Revisit the original goal." });
    const diagnosis = classifyRecovery(messages);
    expect(diagnosis.kind).toBe("wrong-assumption");
    expect(diagnosis.action).toBe("revisit-plan");
  });

  it("formats the next corrective action", () => {
    const text = formatRecovery(classifyRecovery(msgs({ role: "tool", toolCallId: "1", name: "x", content: "exit code 2" })));
    expect(text).toContain("recover: targeted-bug -> debug");
    expect(text).toContain("next:");
  });
});

describe("/recover", () => {
  it("returns a diagnosis from the current transcript", async () => {
    const result = await recover("", ctx(msgs({ role: "user", content: "This went the wrong direction and missed the requirement." })));
    expect(result.output).toContain("wrong-assumption");
  });
});

function msgs(...items: Message[]): Message[] {
  return [{ role: "system", content: "system" }, ...items];
}

function ctx(messages: Message[]): ReplCtx {
  return {
    convo: { messages, send: async () => ({ finalText: "", iterations: 0, stoppedReason: "done", toolIterations: 0 }), setProvider: () => {}, setSessionMemory: () => {} },
    setup: {} as ReplCtx["setup"],
    dataDir: "",
    state: { sessionId: "s", started: "", turnIndex: 0 },
    env: {},
    now: () => new Date("2026-06-18T00:00:00Z"),
  };
}
