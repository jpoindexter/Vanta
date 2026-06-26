// Parse a single line of `claude -p --output-format stream-json --verbose` output into a
// progress signal and/or the final result, so a headless A2A build streams live ("Write(
// index.html)", "Bash(npm i)") instead of showing nothing until it finishes. Pure, no `any`.
//
// Shapes (captured from the real CLI 2026-06):
//   {"type":"assistant","message":{"content":[{"type":"text","text":"…"}]}}
//   {"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{…}}]}}
//   {"type":"result","is_error":false,"result":"…final summary…"}
// Everything else (system/hook/rate_limit events) is ignored.

export type StreamEvent = { progress?: string; result?: string; isError?: boolean };

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/** A short detail for a tool_use — the file/command/pattern, basename only. */
function toolDetail(input: unknown): string {
  const o = asObj(input);
  const f = o?.file_path ?? o?.path ?? o?.command ?? o?.pattern;
  return typeof f === "string" ? (f.split("/").pop() ?? f).slice(0, 48) : "";
}

/** The first meaningful content part as a one-line progress string. */
function summarize(parts: unknown[]): string | undefined {
  for (const p of parts) {
    const o = asObj(p);
    if (o?.type === "tool_use" && typeof o.name === "string") return `${o.name}(${toolDetail(o.input)})`;
    if (o?.type === "text" && typeof o.text === "string" && o.text.trim()) return o.text.trim().slice(0, 100);
  }
  return undefined;
}

/** Parse one stream-json line. Returns {} for noise (system/hook/unparseable) lines. */
export function parseClaudeStreamLine(line: string): StreamEvent {
  let ev: unknown;
  try { ev = JSON.parse(line); } catch { return {}; }
  const o = asObj(ev);
  if (!o) return {};
  if (o.type === "result") return { result: typeof o.result === "string" ? o.result : undefined, isError: o.is_error === true };
  if (o.type === "assistant") {
    const msg = asObj(o.message);
    const content = msg && Array.isArray(msg.content) ? msg.content : [];
    const progress = summarize(content);
    return progress ? { progress } : {};
  }
  return {};
}
