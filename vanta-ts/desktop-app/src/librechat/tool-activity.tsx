// Presentation adapted from LibreChat ToolCallGroup.tsx at
// f10b1d91f1eee3a2c82d5247bf620351486b7c1b. Copyright (c) 2026 LibreChat.
// MIT; see ./LICENSE. Vanta retains tool execution, result data and approvals.
import { ChevronRight, Wrench } from "lucide-react";
import type { Message } from "../types.js";

type ToolCall = NonNullable<Message["toolCalls"]>[number];
type Props = { calls: ToolCall[]; messages: Message[] };

export function ToolActivity({ calls, messages }: Props) {
  if (!calls.length) return null;
  const rows = calls.map((call) => ({ call, result: messages.find((message) => message.role === "tool" && message.toolCallId === call.id) }));
  const names = [...new Set(calls.map((call) => readableToolName(call.name)))];
  const label = names.length <= 2 ? names.join(", ") : `${calls.length} tool calls`;
  const missing = rows.filter((row) => !row.result).length;
  const progress = missing
    ? `${missing} result${missing === 1 ? "" : "s"} not recorded`
    : `${rows.length} result${rows.length === 1 ? "" : "s"} received`;
  return <section className="lc-tool-activity" aria-label="Run steps">
    <details className="lc-tool-group">
      <summary><Wrench size={14} aria-hidden="true" /><span className="lc-activity-label">{label}</span><span className="lc-activity-meta">{progress}</span><ChevronRight className="lc-activity-chevron" size={14} aria-hidden="true" /></summary>
      <div className="lc-activity-rail">{rows.map(({ call, result }) => <ToolResult key={call.id} call={call} result={result} />)}</div>
    </details>
  </section>;
}

function ToolResult({ call, result }: { call: ToolCall; result?: Message }) {
  // A returned payload may be an error. Presence is not success or verification.
  return <div className="lc-tool-result">
    <strong>{readableToolName(call.name)}</strong><code>{call.name}</code>
    <pre>{result ? result.content || "Empty result." : "No result recorded."}</pre>
  </div>;
}

function readableToolName(name: string): string {
  return name.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
