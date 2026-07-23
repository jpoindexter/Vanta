import type { Message } from "../types.js";

// Pure tool-call trace anomaly detection (PAPER-OBSERVABILITY). Consumes the last
// turn's tool calls from the message history and returns any structural anomalies
// found. Stateless — no threshold state, no LLM call, no file I/O.

export type AnomalyType = "loop" | "error-spike" | "blind-write";
export type AnomalySeverity = "warn" | "alert";

export type TraceAnomaly = {
  type: AnomalyType;
  detail: string;
  severity: AnomalySeverity;
};

export type TurnCall = { name: string; result: string; isError: boolean; args?: Record<string, unknown> };

const WRITE_TOOLS = new Set(["write_file", "edit_file", "shell_cmd", "run_code"]);
const READ_TOOLS = new Set([
  "read_file", "grep_files", "glob_files",
  "web_fetch", "web_search", "inspect_state",
]);
const LOOP_THRESHOLD = 3;    // same tool ≥N times → warn; ≥6 → alert
const ERROR_THRESHOLD = 3;   // ≥N consecutive errors → alert

// Matches common OS-level error patterns that don't start with "Error:"
const OS_ERROR_PATTERN = /\b(operation not permitted|permission denied|eperm|enoent|eacces|eaddrinuse|command not found)\b/i;

/**
 * Extract tool calls (+ results) across the latest user turn. Agents commonly
 * read in one assistant batch and write in a later batch; reducing the turn to
 * only its final batch creates false blind-write warnings.
 */
export function extractLastTurnCalls(messages: Message[]): TurnCall[] {
  let turnStart = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      turnStart = i + 1;
      break;
    }
  }
  // Some tests/legacy histories omit user messages. Preserve the old behavior
  // there by starting at the last assistant batch that contains tool calls.
  if (turnStart < 0) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.role === "assistant" && msg.toolCalls?.length) {
        turnStart = i;
        break;
      }
    }
  }
  if (turnStart < 0) return [];

  const turn = messages.slice(turnStart);
  const toolResults = turn.filter((msg) => msg.role === "tool");
  const calls: TurnCall[] = [];
  let fallbackIndex = 0;
  for (const msg of turn) {
    if (msg.role !== "assistant" || !msg.toolCalls?.length) continue;
    for (const tc of msg.toolCalls) {
      const byId = toolResults.find((result) => result.toolCallId === tc.id);
      const resultMsg = byId ?? toolResults[fallbackIndex];
      fallbackIndex += 1;
      const content = resultMsg?.content ?? "";
      const isError = /^(error|blocked|failed|unsupported)/i.test(content.trim())
        || OS_ERROR_PATTERN.test(content);
      calls.push({ name: tc.name, result: content, isError, args: tc.arguments });
    }
  }
  return calls;
}

/** Same tool called ≥LOOP_THRESHOLD times in one turn. */
function detectLoops(calls: TurnCall[]): TraceAnomaly[] {
  const counts = new Map<string, number>();
  for (const { name } of calls) counts.set(name, (counts.get(name) ?? 0) + 1);
  const out: TraceAnomaly[] = [];
  for (const [name, n] of counts) {
    if (n >= LOOP_THRESHOLD) {
      out.push({ type: "loop", detail: `${name} called ${n}× in one turn`, severity: n >= 6 ? "alert" : "warn" });
    }
  }
  return out;
}

/** ≥ERROR_THRESHOLD consecutive errors. */
function detectErrorSpike(calls: TurnCall[]): TraceAnomaly[] {
  let errRun = 0;
  let maxErr = 0;
  for (const { isError } of calls) {
    errRun = isError ? errRun + 1 : 0;
    maxErr = Math.max(maxErr, errRun);
  }
  return maxErr >= ERROR_THRESHOLD
    ? [{ type: "error-spike", detail: `${maxErr} consecutive errors`, severity: "alert" }]
    : [];
}

// Heuristic: shell_cmd is a write only when the command redirects output or
// invokes file-mutating operations. Auth/setup/status commands are neutral.
const SHELL_WRITE_PATTERN = /(?:^|[;&|])\s*(?:rm\s|mv\s|cp\s|chmod|chown|truncate|dd\s|tee\s|mkdir|touch\s)|[>]/;

function shellCmdIsWrite(args?: Record<string, unknown>): boolean {
  if (!args) return true; // conservative: no info → treat as write
  const cmd = typeof args.command === "string" ? args.command.trim() : "";
  return !cmd || SHELL_WRITE_PATTERN.test(cmd);
}

/** First write-class tool appears before any read-class tool. */
function detectBlindWrite(calls: TurnCall[]): TraceAnomaly[] {
  let hadRead = false;
  for (const { name, isError, args } of calls) {
    if (READ_TOOLS.has(name)) { hadRead = true; continue; }
    const isWrite = WRITE_TOOLS.has(name)
      && (name !== "shell_cmd" || shellCmdIsWrite(args));
    if (isWrite && !hadRead && !isError) {
      return [{ type: "blind-write", detail: `${name} before any read`, severity: "warn" }];
    }
  }
  return [];
}

/** Pure: analyse calls for structural anomalies; returns all found. */
export function detectAnomalies(calls: TurnCall[]): TraceAnomaly[] {
  if (!calls.length) return [];
  return [...detectLoops(calls), ...detectErrorSpike(calls), ...detectBlindWrite(calls)];
}

export function formatAnomalyNote(anomalies: TraceAnomaly[]): string {
  return anomalies.map((a) => `⚠ trace[${a.type}]: ${a.detail}`).join("\n");
}
