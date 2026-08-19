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
  "web_fetch", "web_search", "inspect_state", "apple_mail_audit",
  "browser_extract", "screenshot", "look_at_screen", "look_at_camera", "job_profile_scan",
]);
const LOOP_THRESHOLD = 3;    // identical consecutive tool + args ≥N → warn; ≥6 → alert
const ERROR_THRESHOLD = 3;   // ≥N consecutive errors → alert

// Matches common OS-level error patterns that don't start with "Error:"
const OS_ERROR_PATTERN = /\b(operation not permitted|permission denied|eperm|enoent|eacces|eaddrinuse|command not found|failed to create query for)\b/i;

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

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableValue(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function callSignature(call: TurnCall): string {
  return `${call.name}:${stableValue(call.args ?? {})}`;
}

/** Identical tool + arguments repeated consecutively ≥LOOP_THRESHOLD times. */
function detectLoops(calls: TurnCall[]): TraceAnomaly[] {
  const out: TraceAnomaly[] = [];
  let runStart = 0;
  while (runStart < calls.length) {
    const signature = callSignature(calls[runStart]!);
    let runEnd = runStart + 1;
    while (runEnd < calls.length && callSignature(calls[runEnd]!) === signature) runEnd += 1;
    const n = runEnd - runStart;
    if (n >= LOOP_THRESHOLD) {
      out.push({
        type: "loop",
        detail: `${calls[runStart]!.name} repeated identical action ${n}×`,
        severity: n >= 6 ? "alert" : "warn",
      });
    }
    runStart = runEnd;
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

/** Remove heredoc bodies before looking for shell redirects/mutators. A script
 * can contain comparisons or strings with ">" without the shell writing. */
function shellSurface(command: string): string {
  const lines = command.split("\n");
  const kept: string[] = [];
  let delimiter: string | null = null;
  let stripTabs = false;
  for (const line of lines) {
    if (delimiter) {
      const candidate = stripTabs ? line.replace(/^\t+/, "") : line;
      if (candidate.trim() === delimiter) delimiter = null;
      continue;
    }
    kept.push(line);
    const match = /<<(-)?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/.exec(line);
    if (match) {
      stripTabs = match[1] === "-";
      delimiter = match[3] ?? null;
    }
  }
  return kept.join("\n");
}

function shellCmdIsWrite(args?: Record<string, unknown>): boolean {
  if (!args) return true; // conservative: no info → treat as write
  const cmd = typeof args.command === "string" ? args.command.trim() : "";
  return !cmd || SHELL_WRITE_PATTERN.test(shellSurface(cmd));
}

function isReadTool(name: string): boolean {
  return READ_TOOLS.has(name)
    || /^(read_|list_|search_|inspect_|grep_|glob_|find_)/.test(name)
    || /_(read|search)$/.test(name);
}

/** First write-class tool appears before any read-class tool. */
function detectBlindWrite(calls: TurnCall[]): TraceAnomaly[] {
  let hadRead = false;
  for (const { name, isError, args } of calls) {
    if (isReadTool(name)) { hadRead = true; continue; }
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
