import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { LLMProvider } from "../providers/interface.js";
import type { Message } from "../types.js";

// Session memory — an in-session scratchpad. A background fork distils the
// running conversation into .vanta/session-memory.md throughout the session, and
// the notes are re-injected on compaction and on the next resume. Distinct from
// the per-goal memory store (~/.vanta/memories): that is durable cross-session
// summary; this is a live, overwrite-in-place snapshot of the CURRENT session —
// goal, decisions, the task in flight, open threads — that survives compaction
// better than a lossy auto-summary. Best-effort everywhere: a failure here must
// never touch the main turn.

const FILE = "session-memory.md";
const DEFAULT_EVERY = 3; // distil every Nth turn
const DEFAULT_MIN_TOOLS = 5; // ...or any turn busier than this
const MAX_TRANSCRIPT_CHARS = 6000;

const SESSION_MEMORY_SYS = `You maintain Vanta's session scratchpad — a running markdown notes file for the CURRENT work session. You are given the existing notes and the most recent conversation. Return the COMPLETE updated notes (a full replacement, not a diff).

Keep a tight, current snapshot under these headings (drop a heading if empty):
- **Goal** — the active objective, one line
- **Decisions** — choices made and the reason (durable; keep these)
- **Now** — the task in flight and the specific step in progress
- **Open** — unresolved threads, blockers, next steps
- **Context** — key files/paths/identifiers worth not re-deriving

Rules: terse bullets, no prose. Revise stale lines in place, drop resolved items, promote new decisions. Cap ~35 lines. Output ONLY the markdown notes — no preamble, no closing remark, no code fence.`;

function isDisabled(env: NodeJS.ProcessEnv): boolean {
  const v = (env.VANTA_SESSION_MEMORY ?? "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "off" || v === "no";
}

function numEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function sessionMemoryPath(dataDir: string): string {
  return join(dataDir, FILE);
}

/** Read the current scratchpad, or "" when none exists yet. */
export async function readSessionMemory(dataDir: string): Promise<string> {
  try {
    return await readFile(sessionMemoryPath(dataDir), "utf8");
  } catch {
    return "";
  }
}

/** Overwrite the scratchpad with the latest distilled notes. */
export async function writeSessionMemory(dataDir: string, content: string): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(sessionMemoryPath(dataDir), content, "utf8");
}

/** Delete the scratchpad (used by /reset). Best-effort. */
export async function clearSessionMemory(dataDir: string): Promise<void> {
  await rm(sessionMemoryPath(dataDir), { force: true }).catch(() => {});
}

/**
 * Should the background distiller run this turn? Pure. Fires on a busy turn
 * (>= VANTA_SESSION_MEMORY_MIN_TOOLS tool calls) or periodically (every
 * VANTA_SESSION_MEMORY_EVERY turns). Off when VANTA_SESSION_MEMORY is 0/false/off/no.
 */
export function shouldUpdateSessionMemory(
  turnIndex: number,
  toolIterations: number,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isDisabled(env)) return false;
  if (toolIterations >= numEnv(env.VANTA_SESSION_MEMORY_MIN_TOOLS, DEFAULT_MIN_TOOLS)) return true;
  const every = numEnv(env.VANTA_SESSION_MEMORY_EVERY, DEFAULT_EVERY);
  return turnIndex > 0 && turnIndex % every === 0;
}

function formatLine(m: Message): string | null {
  if (m.role === "system") return null;
  if (m.role === "assistant") {
    const calls = m.toolCalls?.length ? ` [called: ${m.toolCalls.map((c) => c.name).join(", ")}]` : "";
    return m.content || calls ? `ASSISTANT: ${m.content ?? ""}${calls}` : null;
  }
  if (m.role === "tool") return `TOOL(${m.name ?? "?"}): ${m.content.slice(0, 300)}`;
  return `USER: ${m.content}`;
}

/** Render the transcript into a compact, tail-capped string for the distiller. */
export function serializeForNotes(messages: Message[], maxChars = MAX_TRANSCRIPT_CHARS): string {
  const lines: string[] = [];
  for (const m of messages) {
    const line = formatLine(m);
    if (line !== null) lines.push(line);
  }
  const text = lines.join("\n");
  return text.length > maxChars ? `...\n${text.slice(-maxChars)}` : text;
}

/** Strip a wrapping ```/```markdown code fence the model sometimes adds. */
function stripFence(text: string): string {
  const t = text.trim();
  if (!t.startsWith("```")) return t;
  return t
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}

/** Frame the notes for injection into a system prompt (resume) or context (compaction). */
export function sessionMemoryBlock(content: string): string {
  return `Session scratchpad — your running notes from this session (continue from here; don't re-derive state):\n${content.trim()}`;
}

/**
 * Distil the recent transcript into the scratchpad. Uses a single direct
 * provider call (no tool loop) — cheaper and deterministic than a sub-agent, and
 * the file write is an internal op (like memory/handoff), not a gated tool call.
 * Best-effort: any failure returns {updated:false} and is swallowed.
 */
export async function updateSessionMemory(opts: {
  provider: LLMProvider;
  dataDir: string;
  transcript: Message[];
  env?: NodeJS.ProcessEnv;
}): Promise<{ updated: boolean; content?: string }> {
  try {
    const convo = serializeForNotes(opts.transcript);
    if (!convo.trim()) return { updated: false };
    const current = await readSessionMemory(opts.dataDir);
    const { text } = await opts.provider.complete(
      [
        { role: "system", content: SESSION_MEMORY_SYS },
        {
          role: "user",
          content: `EXISTING NOTES:\n${current.trim() || "(none yet)"}\n\nRECENT CONVERSATION:\n${convo}\n\nReturn the updated notes.`,
        },
      ],
      [],
    );
    const cleaned = stripFence(text);
    if (!cleaned) return { updated: false };
    await writeSessionMemory(opts.dataDir, cleaned);
    return { updated: true, content: cleaned };
  } catch {
    return { updated: false };
  }
}
