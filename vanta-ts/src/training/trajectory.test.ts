import { describe, expect, it } from "vitest";
import type { Session } from "../sessions/store.js";
import { buildTrajectoryBatch } from "./trajectory.js";

describe("buildTrajectoryBatch", () => {
  it("segments turns, preserves tool decisions, redacts secrets, and compresses bulky results", () => {
    const secret = `sk-ant-${"x".repeat(40)}`;
    const repeated = Array.from({ length: 1_000 }, (_, index) => `unique log line ${index} ${"x".repeat(20)}`).join("\n");
    const session: Session = {
      id: "session-1", title: "task", started: "2026-01-01", updated: "2026-01-01", projectId: "vanta",
      messages: [
        { role: "user", content: `inspect this ${secret}` },
        { role: "assistant", content: "", toolCalls: [{ id: "call-1", name: "shell_cmd", arguments: { command: `echo ${secret}` } }] },
        { role: "tool", toolCallId: "call-1", name: "shell_cmd", content: repeated },
        { role: "assistant", content: "The inspection passed." },
        { role: "user", content: "summarize" },
        { role: "assistant", content: "Done." },
      ],
    };
    const batch = buildTrajectoryBatch([session], 10);

    expect(batch.examples).toHaveLength(2);
    const toolTurn = batch.examples.find((example) => example.turn === 1)!;
    expect(toolTurn.messages).toContainEqual(expect.objectContaining({ role: "assistant", tool_calls: [expect.objectContaining({ function: expect.objectContaining({ name: "shell_cmd" }) })] }));
    expect(toolTurn.compression.compressedResults).toBe(1);
    expect(toolTurn.compression.tokensAfter).toBeLessThan(toolTurn.compression.tokensBefore);
    expect(JSON.stringify(toolTurn)).toContain("trajectory output elided");
    expect(JSON.stringify(toolTurn)).not.toContain(secret);
    expect(JSON.stringify(toolTurn)).toContain("[REDACTED]");
    expect(batch.sft.find((row) => row.source.turn === 1)?.chosen).toContain("<tool_call>");
  });

  it("honors the batch limit newest-turn first", () => {
    const session: Session = {
      id: "session-2", title: "task", started: "2026-01-01", updated: "2026-01-01",
      messages: [
        { role: "user", content: "first" }, { role: "assistant", content: "one" },
        { role: "user", content: "second" }, { role: "assistant", content: "two" },
      ],
    };
    const batch = buildTrajectoryBatch([session], 1);
    expect(batch.examples).toHaveLength(1);
    expect(batch.examples[0]?.turn).toBe(2);
  });

  it("can select only turns that contain tool calls", () => {
    const session: Session = {
      id: "session-3", title: "task", started: "2026-01-01", updated: "2026-01-01",
      messages: [
        { role: "user", content: "chat" }, { role: "assistant", content: "plain" },
        { role: "user", content: "inspect" },
        { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read_file", arguments: { path: "README.md" } }] },
        { role: "tool", toolCallId: "c1", name: "read_file", content: "contents" },
        { role: "assistant", content: "inspected" },
      ],
    };
    const batch = buildTrajectoryBatch([session], 10, true);
    expect(batch.examples.map((example) => example.turn)).toEqual([2]);
  });
});
