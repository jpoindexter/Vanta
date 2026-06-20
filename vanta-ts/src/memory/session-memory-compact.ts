import type { LLMProvider } from "../providers/interface.js";
import type { Message } from "../types.js";
import { readSessionMemory, writeSessionMemory, updateSessionMemory } from "./session-memory.js";

// VANTA-SESSION-MEMORY-COMPACT — a compaction VARIANT that, instead of letting the
// dropped window collapse into a lossy in-context summary, distils its key facts
// into the persistent session-memory file (.vanta/session-memory.md) and records
// the tool names discovered since the last compact. On the next session the file
// is loaded back (session/prepare-helpers.ts) so prior decisions survive. OFF by
// default (VANTA_SESSION_MEMORY_COMPACT); behavior-preserving when unset.

const TOOLS_HEADING = "**Tools seen**:";

export function resolveSessionMemoryCompact(env: NodeJS.ProcessEnv): boolean {
  const v = (env.VANTA_SESSION_MEMORY_COMPACT ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** Unique, sorted tool names used across a window (assistant tool calls + tool results). Pure. */
export function extractDiscoveredToolNames(messages: Message[]): string[] {
  const names = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls) {
      for (const c of m.toolCalls) names.add(c.name);
    }
    if (m.role === "tool" && m.name) names.add(m.name);
  }
  return [...names].sort();
}

/**
 * Merge a "Tools seen" line into existing notes, accumulating (dedup + sort) with
 * any tools already recorded so the set grows across successive compactions. Pure.
 */
export function mergeToolsLine(notes: string, tools: string[]): string {
  const kept: string[] = [];
  let prevTools: string[] = [];
  for (const line of notes.split("\n")) {
    if (line.startsWith(TOOLS_HEADING)) {
      prevTools = line.slice(TOOLS_HEADING.length).split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      kept.push(line);
    }
  }
  const all = [...new Set([...prevTools, ...tools])].sort();
  const body = kept.join("\n").trim();
  if (!all.length) return body ? `${body}\n` : "";
  return `${body ? `${body}\n` : ""}${TOOLS_HEADING} ${all.join(", ")}\n`;
}

/**
 * Persist the compacted window into the session-memory file: distil it into the
 * structured scratchpad (LLM, best-effort) AND record discovered tool names
 * deterministically. Best-effort — any failure returns {persisted:false} and is
 * swallowed so compaction never breaks.
 */
export async function compactToSessionMemory(opts: {
  provider: LLMProvider;
  dataDir: string;
  window: Message[];
  env?: NodeJS.ProcessEnv;
}): Promise<{ persisted: boolean }> {
  try {
    const tools = extractDiscoveredToolNames(opts.window);
    const { updated, content } = await updateSessionMemory({
      provider: opts.provider,
      dataDir: opts.dataDir,
      transcript: opts.window,
      env: opts.env,
    });
    const base = updated && content ? content : await readSessionMemory(opts.dataDir);
    const merged = mergeToolsLine(base, tools);
    if (!merged.trim()) return { persisted: false };
    await writeSessionMemory(opts.dataDir, merged);
    return { persisted: true };
  } catch {
    return { persisted: false };
  }
}
