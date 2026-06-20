import { appendFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// VANTA-AGENT-MEMORY — a per-agent-type SCOPED memory namespace so a subagent of
// a given type (e.g. "explore") gets its OWN notes that don't pollute another
// type's (e.g. "plan"). Three scopes:
//   user    → ~/.vanta/agent-memory/<agentType>.jsonl   (global, cross-project)
//   project → <repo>/.vanta/agent-memory/<agentType>.jsonl (this repo only)
//   local   → <tmp>/vanta-agent-memory/<agentType>.jsonl  (session-scoped, ephemeral)
// An UNSET scope (no VANTA_AGENT_MEMORY_SCOPE) yields the default: current
// behavior is the existing shared per-goal memory (memory/store.ts), so callers
// that don't opt a subagent into a scope keep using the shared store unchanged.
//
// Pure/injectable by design: every side effect (read/write/now) is a dep, so the
// store is fully unit-tested with no real disk. Like team-memory, this is a
// best-effort context aid — a read/write failure must NEVER throw into a worker
// (the spawn wiring swallows it), so the store fails closed and returns values,
// never exceptions.

const AGENT_MEMORY_DIR = "agent-memory";
const LOCAL_TMP_DIR = "vanta-agent-memory";

/** Where an agent-type's memory lives. */
export type AgentMemoryScope = "user" | "project" | "local";

const SCOPES: readonly AgentMemoryScope[] = ["user", "project", "local"];

/** The env var naming the active scope. Unset/empty → default (shared memory). */
export const AGENT_MEMORY_SCOPE_ENV = "VANTA_AGENT_MEMORY_SCOPE";

const AgentMemoryEntrySchema = z.object({
  ts: z.string().min(1),
  note: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

/** One scoped note written by an agent of a given type, as stored in its JSONL. */
export type AgentMemoryEntry = z.infer<typeof AgentMemoryEntrySchema>;

/** Injected effects for the agent-memory store — all I/O + clock are deps. */
export interface AgentMemoryDeps {
  read: () => Promise<string | null>;
  append: (line: string) => Promise<void>;
  now: () => Date;
}

/**
 * Resolve the active memory scope from the environment. `VANTA_AGENT_MEMORY_SCOPE`
 * names one of `user`/`project`/`local`; an unset, whitespace-only, or
 * unrecognized value yields `null`, meaning "no scope" → fall back to the
 * existing shared memory (current behavior preserved). Pure.
 */
export function resolveAgentScope(
  env: NodeJS.ProcessEnv = process.env,
): AgentMemoryScope | null {
  const raw = env[AGENT_MEMORY_SCOPE_ENV]?.trim().toLowerCase();
  return raw && (SCOPES as readonly string[]).includes(raw)
    ? (raw as AgentMemoryScope)
    : null;
}

/**
 * Reduce an arbitrary agent type to a safe filename slug. Strips path separators
 * and traversal so an agent-memory write can never escape `agent-memory/` — no
 * `../`, no absolute path, no separators reach the filename. Mirrors
 * `sanitizeTeamId`/`slugifySkillName`. Pure. Empty/garbage type → `"default"`.
 */
export function sanitizeAgentType(agentType: string): string {
  const slug = agentType
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "default";
}

/**
 * Resolve the on-disk JSONL path for an agent type's memory at the given scope.
 * The agentType is sanitized here so the path can never escape the scope's
 * agent-memory dir. Pure (no I/O — just path math).
 *   user    → <vantaHome>/agent-memory/<slug>.jsonl
 *   project → <repoRoot>/.vanta/agent-memory/<slug>.jsonl
 *   local   → <tmp>/vanta-agent-memory/<slug>.jsonl
 */
export function resolveAgentMemoryPath(
  agentType: string,
  scope: AgentMemoryScope,
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): { dir: string; path: string } {
  const dir = scopeDir(scope, repoRoot, env);
  const path = join(dir, `${sanitizeAgentType(agentType)}.jsonl`);
  return { dir, path };
}

/** The agent-memory directory for a scope (no filename). Pure. */
function scopeDir(
  scope: AgentMemoryScope,
  repoRoot: string,
  env: NodeJS.ProcessEnv,
): string {
  if (scope === "user") return join(resolveVantaHome(env), AGENT_MEMORY_DIR);
  if (scope === "project") return join(repoRoot, ".vanta", AGENT_MEMORY_DIR);
  return join(tmpdir(), LOCAL_TMP_DIR);
}

/**
 * Parse stored JSONL into valid entries. Tolerant: a missing file (`null`)
 * yields `[]`, and any individual line that isn't JSON or fails the schema is
 * dropped rather than rejecting the whole file. Pure.
 */
export function parseAgentMemory(raw: string | null): AgentMemoryEntry[] {
  if (raw === null) return [];
  const out: AgentMemoryEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    out.push(...parseLine(line));
  }
  return out;
}

/** Parse one JSONL line → `[entry]` or `[]` (malformed/non-JSON dropped). */
function parseLine(line: string): AgentMemoryEntry[] {
  try {
    const parsed = AgentMemoryEntrySchema.safeParse(JSON.parse(line));
    return parsed.success ? [parsed.data] : [];
  } catch {
    return []; // not JSON — skip, don't brick the whole read
  }
}

/**
 * Append `entry` to this agent type's scoped memory. The `ts` is stamped from the
 * injected clock when absent. Best-effort — a write failure is swallowed so a
 * scoped-memory append never throws into the worker. Returns `true` on a
 * recorded write, `false` if it was swallowed.
 */
export async function appendAgentMemory(
  entry: Omit<AgentMemoryEntry, "ts"> & { ts?: string },
  deps: AgentMemoryDeps,
): Promise<boolean> {
  try {
    const row: AgentMemoryEntry = {
      ts: entry.ts ?? deps.now().toISOString(),
      note: entry.note,
      ...(entry.tags ? { tags: entry.tags } : {}),
    };
    await deps.append(JSON.stringify(row) + "\n");
    return true;
  } catch {
    return false; // best-effort — a memory failure must never break the worker
  }
}

/**
 * Read this agent type's scoped memory. Tolerant: returns `[]` on any read/parse
 * failure or a missing file, never throwing into the worker.
 */
export async function readAgentMemory(
  deps: AgentMemoryDeps,
): Promise<AgentMemoryEntry[]> {
  try {
    return parseAgentMemory(await deps.read());
  } catch {
    return []; // read failure → empty, never throw
  }
}

/**
 * Build {@link AgentMemoryDeps} backed by the real scoped JSONL file for an
 * agent type. The path is resolved (and the agentType sanitized) via
 * {@link resolveAgentMemoryPath}, so the on-disk file can never escape the
 * scope's agent-memory dir. The spawn wiring uses this; tests inject their own.
 */
export function defaultAgentMemoryDeps(
  agentType: string,
  scope: AgentMemoryScope,
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): AgentMemoryDeps {
  const { dir, path } = resolveAgentMemoryPath(agentType, scope, repoRoot, env);
  return {
    read: async () => {
      try {
        return await readFile(path, "utf8");
      } catch {
        return null; // missing file → tolerant reader yields []
      }
    },
    append: async (line) => {
      await mkdir(dir, { recursive: true });
      await appendFile(path, line, "utf8");
    },
    now: () => new Date(),
  };
}
