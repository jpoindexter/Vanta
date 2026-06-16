import { describe, it, expect } from "vitest";
import type { Message } from "../types.js";
import { maskStaleToolOutputs, resolveObservationMaskKeep } from "./observation-mask.js";

function tool(id: string, content: string): Message {
  return { role: "tool", toolCallId: id, name: "shell", content };
}

function user(content = "hi"): Message {
  return { role: "user", content };
}

function asst(content = "ok"): Message {
  return { role: "assistant", content };
}

describe("maskStaleToolOutputs", () => {
  it("returns the same list when fewer than keepRecent tool results exist", () => {
    const msgs: Message[] = [user(), tool("t1", "output1"), tool("t2", "output2")];
    const result = maskStaleToolOutputs(msgs, { keepRecent: 6 });
    expect(result[1]?.content).toBe("output1");
    expect(result[2]?.content).toBe("output2");
  });

  it("masks older results beyond keepRecent", () => {
    const msgs: Message[] = [
      tool("t1", "old-output"),
      tool("t2", "old-output-2"),
      tool("t3", "recent-1"),
    ];
    const result = maskStaleToolOutputs(msgs, { keepRecent: 2 });
    expect(result[0]?.content).toMatch(/masked/);
    expect(result[1]?.content).toBe("old-output-2");
    expect(result[2]?.content).toBe("recent-1");
  });

  it("records the original char count in the placeholder", () => {
    const content = "x".repeat(500);
    const msgs: Message[] = [tool("t1", content), tool("t2", "recent")];
    const result = maskStaleToolOutputs(msgs, { keepRecent: 1 });
    expect(result[0]?.content).toContain("500");
  });

  it("never masks assistant or user messages", () => {
    const msgs: Message[] = [asst("thinking"), tool("t1", "old"), user("prompt")];
    const result = maskStaleToolOutputs(msgs, { keepRecent: 0 });
    expect(result[0]?.content).toBe("thinking");
    expect(result[2]?.content).toBe("prompt");
  });

  it("accepts a custom placeholder", () => {
    const msgs: Message[] = [tool("t1", "abc"), tool("t2", "def")];
    const result = maskStaleToolOutputs(msgs, { keepRecent: 1, placeholder: () => "REDACTED" });
    expect(result[0]?.content).toBe("REDACTED");
    expect(result[1]?.content).toBe("def");
  });

  it("does not mutate the original messages array", () => {
    const msgs: Message[] = [tool("t1", "original"), tool("t2", "kept")];
    maskStaleToolOutputs(msgs, { keepRecent: 1 });
    expect(msgs[0]?.content).toBe("original");
  });
});

describe("resolveObservationMaskKeep", () => {
  it("returns undefined when env var is absent", () => {
    expect(resolveObservationMaskKeep({})).toBeUndefined();
  });

  it("returns undefined when set to 0 or false", () => {
    expect(resolveObservationMaskKeep({ VANTA_OBSERVATION_MASKING: "0" })).toBeUndefined();
    expect(resolveObservationMaskKeep({ VANTA_OBSERVATION_MASKING: "false" })).toBeUndefined();
  });

  it("returns the default keep count when set to 1/true/yes", () => {
    const d = resolveObservationMaskKeep({ VANTA_OBSERVATION_MASKING: "1" });
    expect(d).toBeGreaterThan(0);
  });

  it("returns the parsed numeric value when a positive integer is given", () => {
    expect(resolveObservationMaskKeep({ VANTA_OBSERVATION_MASKING: "10" })).toBe(10);
  });
});
