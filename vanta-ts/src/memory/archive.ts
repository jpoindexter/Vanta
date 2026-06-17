import { resolveMemoryStore } from "../store/memory-store.js";
import type { Message } from "../types.js";

const ARCHIVE_DIR = "archive";

function archiveFile(sessionId: string): string {
  return `${ARCHIVE_DIR}/${sessionId}.jsonl`;
}

type ArchiveLine = {
  sessionId: string;
  ts: string;
  role: string;
  content: string;
  turnIndex?: number;
};

/**
 * MEM-VERBATIM: Archive a session's messages as JSONL to ~/.vanta/archive/<sessionId>.jsonl.
 * Verbatim archive (not summaries) — enables retroactive search and replay.
 */
export async function archiveSession(
  sessionId: string,
  messages: Message[],
  opts: { env?: NodeJS.ProcessEnv; now?: string } = {},
): Promise<void> {
  const store = resolveMemoryStore(opts.env);
  const ts = opts.now ?? new Date().toISOString();
  const lines: string[] = [];
  let turnIndex = 0;
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") turnIndex++;
    const line: ArchiveLine = { sessionId, ts, role: m.role, content: m.content ?? "", turnIndex };
    lines.push(JSON.stringify(line));
  }
  if (!lines.length) return;
  await store.append(archiveFile(sessionId), lines.join("\n") + "\n");
}

/**
 * MEM-VERBATIM: Keyword search across all archived sessions.
 * Returns matching lines with context (sessionId, role, excerpt).
 */
export async function searchArchive(
  query: string,
  opts: { env?: NodeJS.ProcessEnv; maxResults?: number } = {},
): Promise<Array<{ sessionId: string; role: string; excerpt: string }>> {
  const store = resolveMemoryStore(opts.env);
  const maxResults = opts.maxResults ?? 10;
  const kw = query.toLowerCase();
  const results: Array<{ sessionId: string; role: string; excerpt: string }> = [];

  const files = (await store.list(ARCHIVE_DIR))
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .reverse(); // newest first

  for (const file of files) {
    if (results.length >= maxResults) break;
    const raw = (await store.read(`${ARCHIVE_DIR}/${file}`)) ?? "";
    for (const line of raw.split("\n").filter(Boolean)) {
      if (results.length >= maxResults) break;
      try {
        const entry: ArchiveLine = JSON.parse(line);
        if (entry.content.toLowerCase().includes(kw)) {
          const excerpt = entry.content.slice(0, 120).replace(/\s+/g, " ").trim();
          results.push({ sessionId: entry.sessionId, role: entry.role, excerpt });
        }
      } catch { /* malformed line */ }
    }
  }
  return results;
}
