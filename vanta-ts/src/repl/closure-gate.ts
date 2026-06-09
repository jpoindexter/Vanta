import type { Message } from "../types.js";

export type WrittenFile = { path: string; idx: number };

/** Returns all file paths written via write_file tool calls, with their message index. */
export function extractWrittenFiles(messages: Message[]): WrittenFile[] {
  const files: WrittenFile[] = [];
  messages.forEach((m, idx) => {
    if (m.role !== "assistant" || !m.toolCalls) return;
    for (const tc of m.toolCalls) {
      if (tc.name === "write_file" && typeof tc.arguments.path === "string") {
        files.push({ path: tc.arguments.path, idx });
      }
    }
  });
  return files;
}

/**
 * True when a shell_cmd tool result mentioning "commit" appears after `afterIdx`.
 * Both the tool result content and the assistant call arguments are checked.
 */
/** True when a message is a `shell_cmd` commit — as a tool result or an assistant call. */
function isCommitSignal(m: Message): boolean {
  if (m.role === "tool" && m.name === "shell_cmd" && m.content.toLowerCase().includes("commit")) return true;
  if (m.role === "assistant" && m.toolCalls) {
    return m.toolCalls.some(
      (tc) => tc.name === "shell_cmd" && typeof tc.arguments.command === "string" && tc.arguments.command.toLowerCase().includes("commit"),
    );
  }
  return false;
}

export function hasCommitAfterIndex(messages: Message[], afterIdx: number): boolean {
  for (let i = afterIdx + 1; i < messages.length; i++) {
    const m = messages[i];
    if (m && isCommitSignal(m)) return true;
  }
  return false;
}

/** Returns up to 5 file paths that were written this session without a subsequent commit. */
export function getInProgressItems(messages: Message[]): string[] {
  const writes = extractWrittenFiles(messages);
  const seen = new Set<string>();
  const unclosed: string[] = [];
  for (const { path, idx } of writes) {
    if (!seen.has(path) && !hasCommitAfterIndex(messages, idx)) {
      seen.add(path);
      unclosed.push(path);
    }
  }
  return unclosed.slice(0, 5);
}

export function buildClosureGateText(items: string[]): string {
  const list = items.map((p, i) => `  ${i + 1}. ${p}`).join("\n");
  return (
    `⛔ Before switching — ${items.length} item(s) look in-progress this session:\n${list}\n` +
    `Close one first, or defer all? (/boundary to mark the transition)`
  );
}
