import { parseClaudeStreamLine } from "../agents/claude-stream.js";
import { asCount, asRecord, asString, event, isHeartbeat, parseJsonLine, type OutputParser, type ParsedRun } from "./parser.js";
import type { RunEvent, Usage } from "./types.js";

// `claude -p --output-format stream-json --verbose` emits one JSON object per
// line: a system init (session id, model), assistant and user messages, and a
// final `result` object carrying the answer, token usage and total_cost_usd.
// Progress text reuses the existing claude-stream summariser.

type Obj = Record<string, unknown>;

/** Input tokens are everything the model read: fresh, cache writes and cache reads. */
function inputTokens(u: Obj | null): number | undefined {
  const known = [asCount(u?.input_tokens), asCount(u?.cache_creation_input_tokens), asCount(u?.cache_read_input_tokens)].filter((n): n is number => n !== undefined);
  return known.length ? known.reduce((a, b) => a + b, 0) : undefined;
}

function usageOf(result: Obj): Usage | undefined {
  const u = asRecord(result.usage);
  const input = inputTokens(u);
  const output = asCount(u?.output_tokens);
  const cost = typeof result.total_cost_usd === "number" && result.total_cost_usd >= 0 ? result.total_cost_usd : undefined;
  if (input === undefined && output === undefined && cost === undefined) return undefined;
  return { ...(input !== undefined ? { inputTokens: input } : {}), ...(output !== undefined ? { outputTokens: output } : {}), costUsd: cost ?? null };
}

function denialNote(result: Obj): string | undefined {
  const denials = Array.isArray(result.permission_denials) ? result.permission_denials.length : 0;
  return denials > 0 ? `${denials} tool call${denials === 1 ? " was" : "s were"} denied by Claude Code's permission mode` : undefined;
}

function usesTool(obj: Obj): boolean {
  const content = asRecord(obj.message)?.content;
  return Array.isArray(content) && content.some((part) => asRecord(part)?.type === "tool_use");
}

function errorTextOf(result: Obj): string | undefined {
  const subtype = asString(result.subtype) ?? "success";
  return result.is_error === true || subtype.startsWith("error") ? asString(result.result) ?? subtype : undefined;
}

export function createClaudeParser(): OutputParser {
  const state: ParsedRun = { failed: false };
  let sawResult = false;
  let denials: string | undefined;

  const onSystem = (obj: Obj): RunEvent[] => {
    state.sessionId ??= asString(obj.session_id);
    state.model ??= asString(obj.model);
    return [];
  };
  const onResult = (obj: Obj): RunEvent[] => {
    sawResult = true;
    state.sessionId = asString(obj.session_id) ?? state.sessionId;
    state.finalMessage = asString(obj.result) ?? state.finalMessage;
    state.errorText = errorTextOf(obj);
    state.failed = state.errorText !== undefined;
    state.usage = usageOf(obj);
    denials = denialNote(obj);
    return state.usage ? [event("usage", "usage reported")] : [];
  };
  const onMessage = (obj: Obj, line: string): RunEvent[] => {
    const progress = parseClaudeStreamLine(line).progress;
    return progress ? [event(usesTool(obj) ? "tool" : "message", progress)] : [];
  };

  return {
    feed(line) {
      if (isHeartbeat(line)) return [event("status", line.slice(2))];
      const obj = parseJsonLine(line);
      if (!obj) return [];
      if (obj.type === "system") return onSystem(obj);
      return obj.type === "result" ? onResult(obj) : onMessage(obj, line);
    },
    result() {
      if (!sawResult) return { ...state, failed: true, errorText: "claude ended without a result" };
      return denials && state.finalMessage ? { ...state, finalMessage: `${state.finalMessage}\n\n(${denials}.)` } : state;
    },
  };
}
