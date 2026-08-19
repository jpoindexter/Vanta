import { describe, expect, it } from "vitest";
import { extractLastTurnCalls, detectAnomalies, formatAnomalyNote } from "./trace.js";
import type { Message } from "../types.js";

function makeMsg(
  role: "assistant" | "tool",
  opts: { content?: string; toolCalls?: Array<{ id: string; name: string }>; toolCallId?: string; name?: string },
): Message {
  if (role === "assistant") {
    return {
      role: "assistant",
      content: opts.content ?? "",
      toolCalls: opts.toolCalls?.map((tc) => ({ id: tc.id, name: tc.name, arguments: {} })),
    };
  }
  return { role: "tool", toolCallId: opts.toolCallId!, name: opts.name!, content: opts.content ?? "" };
}

describe("extractLastTurnCalls", () => {
  it("returns [] when the last assistant message has no tool calls", () => {
    const msgs: Message[] = [{ role: "assistant", content: "hi" }];
    expect(extractLastTurnCalls(msgs)).toEqual([]);
  });

  it("returns calls matched by toolCallId", () => {
    const msgs: Message[] = [
      makeMsg("assistant", { toolCalls: [{ id: "tc1", name: "read_file" }, { id: "tc2", name: "write_file" }] }),
      makeMsg("tool", { toolCallId: "tc1", name: "read_file", content: "file content" }),
      makeMsg("tool", { toolCallId: "tc2", name: "write_file", content: "wrote ok" }),
    ];
    const calls = extractLastTurnCalls(msgs);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.name).toBe("read_file");
    expect(calls[1]!.name).toBe("write_file");
  });

  it("marks error results as isError=true", () => {
    const msgs: Message[] = [
      makeMsg("assistant", { toolCalls: [{ id: "tc1", name: "shell_cmd" }] }),
      makeMsg("tool", { toolCallId: "tc1", name: "shell_cmd", content: "Error: permission denied" }),
    ];
    expect(extractLastTurnCalls(msgs)[0]!.isError).toBe(true);
  });

  it("marks OS-level error patterns as isError=true", () => {
    const msgs: Message[] = [
      makeMsg("assistant", { toolCalls: [{ id: "tc1", name: "shell_cmd" }] }),
      makeMsg("tool", { toolCallId: "tc1", name: "shell_cmd", content: "./run.sh: line 21: /home/.vanta/repo-path: Operation not permitted" }),
    ];
    expect(extractLastTurnCalls(msgs)[0]!.isError).toBe(true);
  });

  it("marks a zero-exit mdfind fatal diagnostic as an error", () => {
    const msgs: Message[] = [
      makeMsg("assistant", { toolCalls: [{ id: "tc1", name: "shell_cmd" }] }),
      makeMsg("tool", {
        toolCallId: "tc1",
        name: "shell_cmd",
        content: `Failed to create query for 'kMDItemKind == "Mail Message"'.`,
      }),
    ];
    expect(extractLastTurnCalls(msgs)[0]!.isError).toBe(true);
  });

  it("propagates tool call args through TurnCall", () => {
    const msgs: Message[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "shell_cmd", arguments: { command: "vanta auth google" } }],
      },
      makeMsg("tool", { toolCallId: "tc1", name: "shell_cmd", content: "ok" }),
    ];
    expect(extractLastTurnCalls(msgs)[0]!.args).toEqual({ command: "vanta auth google" });
  });

  it("collects every tool batch in the latest user turn", () => {
    const msgs: Message[] = [
      { role: "user", content: "update the file" },
      makeMsg("assistant", { toolCalls: [{ id: "read", name: "read_file" }] }),
      makeMsg("tool", { toolCallId: "read", name: "read_file", content: "old content" }),
      makeMsg("assistant", { toolCalls: [{ id: "write", name: "write_file" }] }),
      makeMsg("tool", { toolCallId: "write", name: "write_file", content: "wrote ok" }),
      makeMsg("assistant", { content: "done" }),
    ];

    const calls = extractLastTurnCalls(msgs);
    expect(calls.map((call) => call.name)).toEqual(["read_file", "write_file"]);
    expect(detectAnomalies(calls).some((a) => a.type === "blind-write")).toBe(false);
  });
});

describe("detectAnomalies", () => {
  it("returns [] when no calls are passed", () => {
    expect(detectAnomalies([])).toEqual([]);
  });

  it("detects a tool loop when the same tool and arguments repeat consecutively ≥3 times", () => {
    const calls = Array.from({ length: 4 }, () => ({ name: "grep_files", result: "ok", isError: false }));
    const a = detectAnomalies(calls);
    expect(a.some((x) => x.type === "loop")).toBe(true);
    expect(a.find((x) => x.type === "loop")?.severity).toBe("warn");
  });

  it("does not call productive reads or shell commands with different arguments a loop", () => {
    const calls = [
      ...Array.from({ length: 8 }, (_, index) => ({
        name: "read_file",
        result: `file ${index}`,
        isError: false,
        args: { path: `/repo/file-${index}.ts` },
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        name: "shell_cmd",
        result: `command ${index} ok`,
        isError: false,
        args: { command: `node script-${index}.mjs` },
      })),
    ];
    expect(detectAnomalies(calls).some((x) => x.type === "loop")).toBe(false);
  });

  it("does not call non-consecutive retries a loop", () => {
    const calls = [
      { name: "shell_cmd", result: "failed", isError: true, args: { command: "npm test" } },
      { name: "read_file", result: "package", isError: false, args: { path: "package.json" } },
      { name: "shell_cmd", result: "ok", isError: false, args: { command: "npm test" } },
      { name: "read_file", result: "config", isError: false, args: { path: "vitest.config.ts" } },
      { name: "shell_cmd", result: "ok", isError: false, args: { command: "npm test" } },
    ];
    expect(detectAnomalies(calls).some((x) => x.type === "loop")).toBe(false);
  });

  it("marks severity alert when the same tool and arguments repeat consecutively ≥6 times", () => {
    const calls = Array.from({ length: 6 }, () => ({ name: "read_file", result: "ok", isError: false }));
    const a = detectAnomalies(calls);
    expect(a.find((x) => x.type === "loop")?.severity).toBe("alert");
  });

  it("detects an error spike when ≥3 consecutive errors", () => {
    const calls = [
      { name: "shell_cmd", result: "Error: failed", isError: true },
      { name: "shell_cmd", result: "Error: failed", isError: true },
      { name: "shell_cmd", result: "Error: failed", isError: true },
    ];
    const a = detectAnomalies(calls);
    expect(a.some((x) => x.type === "error-spike")).toBe(true);
  });

  it("does NOT flag an error spike when errors are non-consecutive", () => {
    const calls = [
      { name: "shell_cmd", result: "Error", isError: true },
      { name: "read_file", result: "ok", isError: false },
      { name: "shell_cmd", result: "Error", isError: true },
      { name: "shell_cmd", result: "Error", isError: true },
    ];
    const a = detectAnomalies(calls);
    expect(a.some((x) => x.type === "error-spike")).toBe(false);
  });

  it("detects a blind-write when a write tool fires before any read", () => {
    const calls = [
      { name: "write_file", result: "wrote ok", isError: false },
      { name: "read_file", result: "file content", isError: false },
    ];
    const a = detectAnomalies(calls);
    expect(a.some((x) => x.type === "blind-write")).toBe(true);
  });

  it("does NOT flag blind-write when a read precedes the write", () => {
    const calls = [
      { name: "read_file", result: "content", isError: false },
      { name: "write_file", result: "wrote ok", isError: false },
    ];
    expect(detectAnomalies(calls).some((x) => x.type === "blind-write")).toBe(false);
  });

  it.each(["linkedin_read", "github_read", "browser_read", "apple_mail_audit", "list_mcp_resources"])(
    "recognizes %s as a read before a write",
    (name) => {
      const calls = [
        { name, result: "read result", isError: false },
        { name: "write_file", result: "wrote ok", isError: false },
      ];
      expect(detectAnomalies(calls).some((x) => x.type === "blind-write")).toBe(false);
    },
  );

  it("does not mistake browser_act for a read", () => {
    const calls = [
      { name: "browser_act", result: "clicked", isError: false },
      { name: "write_file", result: "wrote ok", isError: false },
    ];
    expect(detectAnomalies(calls).some((x) => x.type === "blind-write")).toBe(true);
  });

  it("does NOT flag blind-write for auth/setup shell_cmd before a read", () => {
    const calls = [
      { name: "shell_cmd", result: "oauth ok", isError: false, args: { command: "./run.sh auth google" } },
      { name: "read_file", result: "content", isError: false },
    ];
    expect(detectAnomalies(calls).some((x) => x.type === "blind-write")).toBe(false);
  });

  it("DOES flag blind-write for a shell_cmd that redirects output before a read", () => {
    const calls = [
      { name: "shell_cmd", result: "wrote ok", isError: false, args: { command: "echo foo > important.ts" } },
      { name: "read_file", result: "content", isError: false },
    ];
    expect(detectAnomalies(calls).some((x) => x.type === "blind-write")).toBe(true);
  });

  it("does NOT parse comparison operators inside a read-only heredoc as shell writes", () => {
    const calls = [{
      name: "shell_cmd",
      result: "SCANNED 35872",
      isError: false,
      args: {
        command: `python3 - <<'PY'
for count in range(10):
    if count > 3:
        print(count)
PY`,
      },
    }];
    expect(detectAnomalies(calls).some((x) => x.type === "blind-write")).toBe(false);
  });

  it("still detects a shell redirection after a heredoc body", () => {
    const calls = [{
      name: "shell_cmd",
      result: "wrote",
      isError: false,
      args: {
        command: `python3 - <<'PY'
print(">")
PY
echo done > result.txt`,
      },
    }];
    expect(detectAnomalies(calls).some((x) => x.type === "blind-write")).toBe(true);
  });

  it("does NOT flag blind-write for a shell_cmd that produced an OS-level error", () => {
    const calls = [
      { name: "shell_cmd", result: "./run.sh: line 21: /path: Operation not permitted", isError: true },
      { name: "read_file", result: "content", isError: false },
    ];
    expect(detectAnomalies(calls).some((x) => x.type === "blind-write")).toBe(false);
  });

  it("returns empty when everything looks normal", () => {
    const calls = [
      { name: "read_file", result: "content", isError: false },
      { name: "write_file", result: "wrote", isError: false },
      { name: "shell_cmd", result: "ok", isError: false },
    ];
    expect(detectAnomalies(calls)).toEqual([]);
  });
});

describe("formatAnomalyNote", () => {
  it("formats anomalies with the ⚠ prefix", () => {
    const note = formatAnomalyNote([{ type: "loop", detail: "read_file called 4×", severity: "warn" }]);
    expect(note).toContain("⚠ trace[loop]");
    expect(note).toContain("read_file called 4×");
  });
});
