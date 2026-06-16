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

export type TurnCall = { name: string; result: string; isError: boolean };

const WRITE_TOOLS = new Set(["write_file", "edit_file", "shell_cmd", "run_code"]);
const READ_TOOLS = new Set([
  "read_file", "grep_files", "glob_files",
  "web_fetch", "web_search", "inspect_state",
]);
const LOOP_THRESHOLD = 3;    // same tool ≥N times → warn; ≥6 → alert
const ERROR_THRESHOLD = 3;   // ≥N consecutive errors → alert

/**
 * Extract the tool calls (+ their results) from the last assistant turn in
 * the message history. Returns [] when the last turn had no tool calls.
 */
export function extractLastTurnCalls(messages: Message[]): TurnCall[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || msg.role !== "assistant") continue;
    const toolCalls = msg.toolCalls;
    if (!toolCalls?.length) continue;
    const toolResults = messages.slice(i + 1).filter((m) => m.role === "tool");
    return toolCalls.map((tc, idx) => {
      // Match by id first (reliable), fall back to positional order
      const byId = toolResults.find((m) => m.role === "tool" && m.toolCallId === tc.id);
      const resultMsg = byId ?? toolResults[idx];
      const content = resultMsg?.role === "tool" ? resultMsg.content : "";
      const isError = /^(error|blocked|failed|unsupported)/i.test(content.trim());
      return { name: tc.name, result: content, isError };
    });
  }
  return [];
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

/** First write-class tool appears before any read-class tool. */
function detectBlindWrite(calls: TurnCall[]): TraceAnomaly[] {
  let hadRead = false;
  for (const { name, isError } of calls) {
    if (READ_TOOLS.has(name)) { hadRead = true; continue; }
    if (WRITE_TOOLS.has(name) && !hadRead && !isError) {
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
