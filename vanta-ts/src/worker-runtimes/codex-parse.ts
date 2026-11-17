import { asCount, asRecord, asString, event, isHeartbeat, parseJsonLine, type OutputParser, type ParsedRun } from "./parser.js";
import type { RunEvent, Usage } from "./types.js";

// `codex exec --json` prints JSONL events: thread.started (session id),
// item.started / item.completed (agent_message, command_execution, file_change,
// reasoning ...), turn.completed (token usage) and turn.failed / error. Codex
// reports tokens but never a dollar figure, so costUsd stays null.

type Obj = Record<string, unknown>;

function usageOf(raw: unknown): Usage | undefined {
  const u = asRecord(raw);
  const input = asCount(u?.input_tokens);
  const output = asCount(u?.output_tokens);
  return input === undefined && output === undefined ? undefined : { ...(input !== undefined ? { inputTokens: input } : {}), ...(output !== undefined ? { outputTokens: output } : {}), costUsd: null };
}

const changedPaths = (item: Obj): string[] =>
  (Array.isArray(item.changes) ? item.changes : []).map((c) => asString(asRecord(c)?.path)).filter((p): p is string => p !== undefined);

/** Commands and MCP calls are announced when they start; file edits once they land. */
const ITEM_EVENTS: Record<string, (item: Obj, started: boolean) => RunEvent | undefined> = {
  command_execution: (item, started) => (started ? event("tool", `run ${asString(item.command) ?? "command"}`) : undefined),
  mcp_tool_call: (item, started) => (started ? event("tool", `mcp ${asString(item.tool) ?? "tool"}`) : undefined),
  file_change: (item, started) => (started ? undefined : event("tool", `edit ${changedPaths(item).slice(0, 3).join(", ") || "files"}`)),
};

export function createCodexParser(): OutputParser {
  const state: ParsedRun = { failed: false };
  let completed = false;
  // A bare `error` event can be a retry notice; it only matters if the turn never completes.
  let lastError: string | undefined;

  const onItem = (obj: Obj, started: boolean): RunEvent[] => {
    const item = asRecord(obj.item);
    if (!item) return [];
    if (!started && item.type === "agent_message") {
      state.finalMessage = asString(item.text) ?? state.finalMessage;
      return state.finalMessage ? [event("message", state.finalMessage)] : [];
    }
    const mapped = ITEM_EVENTS[asString(item.type) ?? ""]?.(item, started);
    return mapped ? [mapped] : [];
  };
  const onTurnCompleted = (obj: Obj): RunEvent[] => {
    completed = true;
    state.usage = usageOf(obj.usage) ?? state.usage;
    return state.usage ? [event("usage", "usage reported")] : [];
  };
  const handlers: Record<string, (obj: Obj) => RunEvent[]> = {
    "thread.started": (obj) => { state.sessionId = asString(obj.thread_id) ?? state.sessionId; return []; },
    "turn.completed": onTurnCompleted,
    "turn.failed": (obj) => { state.failed = true; state.errorText = asString(asRecord(obj.error)?.message) ?? lastError ?? "codex reported a failed turn"; return []; },
    error: (obj) => { lastError = asString(obj.message) ?? lastError; return []; },
    "item.started": (obj) => onItem(obj, true),
    "item.completed": (obj) => onItem(obj, false),
  };

  return {
    feed(line) {
      if (isHeartbeat(line)) return [event("status", line.slice(2))];
      const obj = parseJsonLine(line);
      return obj ? handlers[asString(obj.type) ?? ""]?.(obj) ?? [] : [];
    },
    result() {
      if (!completed && !state.failed) return { ...state, failed: true, errorText: lastError ?? "codex ended without completing a turn" };
      return state;
    },
  };
}
