import { appendFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// VANTA-MEM-TEAM — a SHARED team-memory namespace so swarm/fleet workers on the
// same team can see one another's findings. Each team has its own append-only
// JSONL at ~/.vanta/team-memory/<teamId>.jsonl; one worker appends a finding,
// its siblings read it. An UNSET team (no VANTA_TEAM_ID) means no shared memory:
// workers stay isolated — exactly the current behavior.
//
// Pure/injectable by design: every side effect (read/write/now) is a dep, so the
// store is fully unit-tested with no real disk. The team-memory layer is a
// best-effort context aid — a read/write failure must NEVER throw into a worker
// (the swarm wiring swallows it), so the store fails closed and returns values,
// never exceptions.

const TEAM_MEMORY_DIR = "team-memory";

/** The env var naming the active team. Unset/empty → no shared memory. */
export const TEAM_ID_ENV = "VANTA_TEAM_ID";

const TeamMemoryEntrySchema = z.object({
  ts: z.string().min(1),
  author: z.string().min(1),
  note: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

/** One shared finding written by a team worker, as stored in the team JSONL. */
export type TeamMemoryEntry = z.infer<typeof TeamMemoryEntrySchema>;

/** Injected effects for the team-memory store — all I/O + clock are deps. */
export interface TeamMemoryDeps {
  read: () => Promise<string | null>;
  append: (line: string) => Promise<void>;
  now: () => Date;
}

/**
 * Resolve the active team id from the environment. `VANTA_TEAM_ID` names the
 * shared namespace; an unset or whitespace-only value yields `null`, meaning
 * "no team" → no shared memory (workers stay isolated). Pure.
 */
export function resolveTeamId(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env[TEAM_ID_ENV]?.trim();
  return raw ? raw : null;
}

/**
 * Reduce an arbitrary team id to a safe filename slug. Strips path separators
 * and traversal so a team-memory write can never escape `team-memory/` — no
 * `../`, no absolute path, no separators reach the filename. Mirrors
 * `slugifySkillName`. Pure. Empty/garbage id → `"unnamed-team"`.
 */
export function sanitizeTeamId(teamId: string): string {
  const slug = teamId
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "unnamed-team";
}

/**
 * Parse stored JSONL into valid entries. Tolerant: a missing file (`null`)
 * yields `[]`, and any individual line that isn't JSON or fails the schema is
 * dropped rather than rejecting the whole file. Pure.
 */
export function parseTeamMemory(raw: string | null): TeamMemoryEntry[] {
  if (raw === null) return [];
  const out: TeamMemoryEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    out.push(...parseLine(line));
  }
  return out;
}

/** Parse one JSONL line → `[entry]` or `[]` (malformed/non-JSON dropped). */
function parseLine(line: string): TeamMemoryEntry[] {
  try {
    const parsed = TeamMemoryEntrySchema.safeParse(JSON.parse(line));
    return parsed.success ? [parsed.data] : [];
  } catch {
    return []; // not JSON — skip, don't brick the whole read
  }
}

/**
 * Append `entry` to the team's shared memory. The `ts` is stamped from the
 * injected clock when absent. Best-effort — a write failure is swallowed so a
 * shared-memory append never throws into the worker. Returns `true` on a
 * recorded write, `false` if it was swallowed.
 */
export async function appendTeamMemory(
  teamId: string,
  entry: Omit<TeamMemoryEntry, "ts"> & { ts?: string },
  deps: TeamMemoryDeps,
): Promise<boolean> {
  try {
    const row: TeamMemoryEntry = {
      ts: entry.ts ?? deps.now().toISOString(),
      author: entry.author,
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
 * Read the team's shared memory. Tolerant: returns `[]` on any read/parse
 * failure or a missing file, never throwing into the worker.
 */
export async function readTeamMemory(
  teamId: string,
  deps: TeamMemoryDeps,
): Promise<TeamMemoryEntry[]> {
  try {
    return parseTeamMemory(await deps.read());
  } catch {
    return []; // read failure → empty, never throw
  }
}

/**
 * A compact recent-N digest of team findings for injecting into a worker's
 * context on start. Takes the last `max` entries (most recent last, as stored)
 * and renders one line each (`• [author] note #tag`). Empty input → "". Pure.
 */
export function teamMemoryDigest(entries: TeamMemoryEntry[], max = 10): string {
  const cap = max > 0 ? max : 0;
  const recent = cap > 0 ? entries.slice(-cap) : [];
  if (recent.length === 0) return "";
  const lines = recent.map((e) => {
    const tags = e.tags?.length ? ` ${e.tags.map((t) => `#${t}`).join(" ")}` : "";
    return `• [${e.author}] ${e.note}${tags}`;
  });
  return `Team memory (${recent.length} recent):\n${lines.join("\n")}`;
}

/**
 * Build {@link TeamMemoryDeps} backed by the real
 * `~/.vanta/team-memory/<sanitized teamId>.jsonl` file (honours `VANTA_HOME`).
 * The swarm wiring uses this; tests inject their own. The teamId is sanitized
 * here so the on-disk path can never escape the team-memory dir.
 */
export function defaultTeamMemoryDeps(
  teamId: string,
  env: NodeJS.ProcessEnv = process.env,
): TeamMemoryDeps {
  const dir = join(resolveVantaHome(env), TEAM_MEMORY_DIR);
  const path = join(dir, `${sanitizeTeamId(teamId)}.jsonl`);
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
