import type { Message } from "../types.js";
import type { Session } from "./store.js";

export type SessionExport = { filename: string; mime: string; content: string };

const ROLE_LABEL: Record<string, string> = { user: "You", assistant: "Vanta", tool: "Tool" };

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "session";
}

function markdownBlock(message: Message): string {
  if (message.role === "system") return "";
  const label = message.role === "tool" ? `Tool: ${message.name}` : ROLE_LABEL[message.role] ?? message.role;
  const calls = message.role === "assistant" && message.toolCalls?.length
    ? `\n\n${message.toolCalls.map((call) => `_Calls ${call.name}_`).join("\n")}`
    : "";
  const body = message.role === "tool" ? `\`\`\`\n${message.content}\n\`\`\`` : message.content;
  return `## ${label}\n\n${body}${calls}\n`;
}

/** Transcript as Markdown or JSON. Attached image bytes and system prompts are left out. */
export function exportSession(session: Session, format: "markdown" | "json"): SessionExport {
  const base = `${slug(session.title)}-${slug(session.id).slice(0, 8)}`;
  const visible = session.messages.filter((message) => message.role !== "system");
  if (format === "json") {
    const messages = visible.map((message) => (message.role === "user" ? { role: message.role, content: message.content } : message));
    return { filename: `${base}.json`, mime: "application/json", content: `${JSON.stringify({ id: session.id, title: session.title, started: session.started, updated: session.updated, parentSessionId: session.parentSessionId, messages }, null, 2)}\n` };
  }
  const head = `# ${session.title}\n\n_Session ${session.id} · started ${session.started}_\n\n`;
  return { filename: `${base}.md`, mime: "text/markdown", content: head + visible.map(markdownBlock).join("\n") };
}
