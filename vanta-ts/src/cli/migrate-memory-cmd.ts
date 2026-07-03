import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createKernelClient } from "../kernel/client.js";
import { resolveBrain } from "../brain/interface.js";
import { loadEntries, entryId } from "../brain/entries.js";
import {
  ingestAgentMemory,
  MEMORY_SOURCES,
  type AgentMemorySource,
  type MemoryIngestDeps,
  type MemoryIngestResult,
} from "../migrate/memory.js";

// CROSS-AGENT-MEMORY-UNIFY — `vanta migrate memory <claude-code|codex> [path]`:
// import another agent's memory store into the brain, deduped + provenance-tagged.
// Kernel-gated (the import is assessed; a block refuses). Reversible in spirit —
// only additive brain writes, tagged sourceType "external" so they're inspectable.

/** Default on-disk memory store per source (overridable by a positional path). */
function defaultStorePath(source: AgentMemorySource): string {
  return source === "codex"
    ? join(homedir(), ".codex", "AGENTS.md")
    : join(homedir(), ".claude", "CLAUDE.md");
}

function readSafe(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function usage(log: (s: string) => void): number {
  log("  usage: vanta migrate memory <claude-code|codex> [path]");
  log("         imports the agent's memory store into Vanta's brain (deduped, tagged external).");
  return 1;
}

function printReport(log: (s: string) => void, storePath: string, r: MemoryIngestResult): void {
  if (!r.found) {
    log(`  no ${r.source} memory store at ${storePath} — nothing to import.`);
    return;
  }
  log(`  ✓ imported from ${r.source} (${storePath})`);
  log(`    new: ${r.imported}   already-known (deduped): ${r.deduped}`);
  for (const fact of r.importedFacts.slice(0, 8)) log(`    + ${fact.slice(0, 100)}`);
  if (r.importedFacts.length > 8) log(`    …and ${r.importedFacts.length - 8} more`);
}

/** Live deps: read the real store, read the real brain, write via the Brain port. */
function liveIngestDeps(storePath: string, env: NodeJS.ProcessEnv): MemoryIngestDeps {
  const brain = resolveBrain(env);
  return {
    read: () => readSafe(storePath),
    existingIds: async () => new Set((await loadEntries(env)).map((e) => e.id)),
    remember: async (f) => {
      await brain.remember({ region: f.region, content: f.content, entryType: "fact", sourceType: "external", sourceRef: f.sourceRef, env });
    },
    idOf: entryId,
  };
}

export async function runMigrateMemory(rest: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const log = console.log;
  const source = rest[0] as AgentMemorySource | undefined;
  if (!source || !MEMORY_SOURCES.includes(source)) return usage(log);

  const storePath = rest.find((a, i) => i > 0 && !a.startsWith("--")) ?? defaultStorePath(source);

  const verdict = await createKernelClient(env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788")
    .assess(`migrate memory import from ${source} into ~/.vanta brain`)
    .catch(() => ({ risk: "ask" as const, needsHuman: true, reason: "kernel unreachable" }));
  if (verdict.risk === "block") {
    log(`  ✗ blocked by kernel: ${verdict.reason}`);
    return 1;
  }

  const result = await ingestAgentMemory(source, liveIngestDeps(storePath, env));
  printReport(log, storePath, result);
  return 0;
}
