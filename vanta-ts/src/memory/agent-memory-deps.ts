import { appendFile, readFile, mkdir } from "node:fs/promises";
import {
  resolveAgentMemoryPath,
  type AgentMemoryScope,
  type AgentMemoryDeps,
} from "./agent-memory.js";

// The real-FS adapter for the agent-memory store — the one impure, I/O-touching
// seam (agent-memory.ts stays pure/injectable + unit-tested with no real disk).
// Split out for the size gate; re-exported from agent-memory.ts so the spawn
// wiring and tests use the same module path.

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
