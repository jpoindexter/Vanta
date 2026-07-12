import { describe, expect, it } from "vitest";
import type { Message, ToolCall } from "../types.js";
import {
  reconcileDanglingToolResults,
  toolMayHaveSideEffects,
} from "./effect-disposition.js";

function dangling(call: ToolCall): Message[] {
  return [
    { role: "user", content: "do it" },
    { role: "assistant", content: "", toolCalls: [call] },
  ];
}

describe("interrupted tool effect disposition", () => {
  it("classifies a pending mutation as none because execution never started", () => {
    const recovered = reconcileDanglingToolResults(dangling({
      id: "c1", name: "publish_release", arguments: {}, effectState: "pending",
    }));
    expect(recovered.messages.at(-1)).toMatchObject({ role: "tool", effectDisposition: "none" });
  });

  it("classifies a started mutation as unknown and requires inspection", () => {
    const recovered = reconcileDanglingToolResults(dangling({
      id: "c2", name: "publish_release", arguments: {}, effectState: "started",
    }));
    expect(recovered.messages.at(-1)).toMatchObject({ role: "tool", effectDisposition: "unknown" });
    expect(recovered.messages.at(-1)?.content).toMatch(/do not repeat this mutation blindly/i);
  });

  it("treats legacy mutating calls and unknown plugin tools conservatively", () => {
    const recovered = reconcileDanglingToolResults(dangling({
      id: "c3", name: "mcp__external__mutate", arguments: {},
    }));
    expect(toolMayHaveSideEffects("mcp__external__mutate")).toBe(true);
    expect(recovered.messages.at(-1)).toMatchObject({ effectDisposition: "unknown" });
  });

  it("classifies a started known read as none", () => {
    const recovered = reconcileDanglingToolResults(dangling({
      id: "c4", name: "read_file", arguments: {}, effectState: "started",
    }));
    expect(recovered.messages.at(-1)).toMatchObject({ effectDisposition: "none" });
  });

  it("does not duplicate an existing tool result", () => {
    const messages: Message[] = [
      ...dangling({ id: "c5", name: "publish_release", arguments: {}, effectState: "started" }),
      { role: "tool", toolCallId: "c5", name: "publish_release", content: "ok", effectDisposition: "confirmed" },
    ];
    const recovered = reconcileDanglingToolResults(messages);
    expect(recovered.added).toBe(0);
    expect(recovered.messages).toEqual(messages);
  });
});
