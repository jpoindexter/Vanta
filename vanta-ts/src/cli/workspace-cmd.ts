import { dataDirFor } from "./ops.js";
import {
  scrubBundle, parseBundle, mergeCollection,
  type WorkspaceBundle, type WorkspaceRecord, type CollisionStrategy,
} from "../workspace/portability.js";

// PCLIP-WORKSPACE-PORTABILITY — `vanta workspace export [file]` writes a scrubbed
// JSON bundle of the operator workspace; `vanta workspace import <file>
// [--on-collision skip|rename|overwrite]` re-creates its collections with
// id-collision handling. Collection adapters (collect + apply) are the only
// store I/O; the bundle/scrub/merge engine is pure (workspace/portability.ts).

/** A portable collection: how to read its records and write a merged set back. */
type CollectionAdapter = {
  name: string;
  collect: (env: NodeJS.ProcessEnv, dataDir: string) => Promise<WorkspaceRecord[]>;
  apply: (records: WorkspaceRecord[], env: NodeJS.ProcessEnv, dataDir: string) => Promise<void>;
};

/** Skills: list → {id=slug/name, meta, body}; apply writes each via writeSkill. */
const skillsAdapter: CollectionAdapter = {
  name: "skills",
  collect: async (env) => {
    const { listSkills } = await import("../skills/store.js");
    return (await listSkills(env)).map((s) => ({ id: s.meta.name, meta: s.meta, body: s.body } as WorkspaceRecord));
  },
  apply: async (records, env) => {
    const { writeSkill } = await import("../skills/store.js");
    for (const r of records) {
      const meta = (r.meta ?? {}) as { name?: string; description?: string; tags?: string[] };
      await writeSkill({ name: meta.name ?? String(r.id), description: meta.description ?? "", body: String(r.body ?? ""), tags: meta.tags ?? [] }, { env });
    }
  },
};

/** Routines: durable cron entries (id = String(entry.id)). */
const routinesAdapter: CollectionAdapter = {
  name: "routines",
  collect: async (_env, dataDir) => {
    const { loadDurableCron } = await import("../schedule/durable-cron.js");
    return (await loadDurableCron(dataDir)).map((e) => ({ ...e, id: String(e.id) } as WorkspaceRecord));
  },
  apply: async (records, _env, dataDir) => {
    const { saveDurableCron } = await import("../schedule/durable-cron.js");
    const entries = records.map((r) => ({
      id: Number(r.id) || 0, cron: String(r.cron ?? ""), instruction: String(r.instruction ?? ""),
      status: (r.status === "paused" ? "paused" : "active") as "active" | "paused", durable: true as const, recurring: r.recurring !== false,
    })).filter((e) => e.cron && e.instruction);
    await saveDurableCron(dataDir, entries);
  },
};

const ADAPTERS: CollectionAdapter[] = [skillsAdapter, routinesAdapter];

async function runExport(env: NodeJS.ProcessEnv, dataDir: string, rest: string[]): Promise<number> {
  const collections: Record<string, WorkspaceRecord[]> = {};
  for (const a of ADAPTERS) collections[a.name] = await a.collect(env, dataDir).catch(() => []);
  const bundle: WorkspaceBundle = { version: 1, exportedAt: new Date().toISOString(), collections };
  const scrubbed = scrubBundle(bundle);
  const { writeFile } = await import("node:fs/promises");
  const out = rest[0] ?? "vanta-workspace.json";
  await writeFile(out, `${JSON.stringify(scrubbed, null, 2)}\n`, "utf8");
  const counts = ADAPTERS.map((a) => `${collections[a.name]!.length} ${a.name}`).join(", ");
  console.log(`exported (scrubbed) → ${out}: ${counts}`);
  return 0;
}

function collisionStrategy(rest: string[]): CollisionStrategy {
  const i = rest.indexOf("--on-collision");
  const v = i >= 0 ? rest[i + 1] : undefined;
  return v === "overwrite" || v === "rename" ? v : "skip";
}

async function runImport(env: NodeJS.ProcessEnv, dataDir: string, rest: string[]): Promise<number> {
  const file = rest[0];
  if (!file || file.startsWith("--")) { console.error('usage: vanta workspace import <file> [--on-collision skip|rename|overwrite]'); return 1; }
  const { readFile } = await import("node:fs/promises");
  const bundle = parseBundle(JSON.parse(await readFile(file, "utf8").catch(() => "null")));
  if (!bundle) { console.error(`not a valid workspace bundle: ${file}`); return 1; }
  const strategy = collisionStrategy(rest);
  for (const a of ADAPTERS) {
    const incoming = bundle.collections[a.name] ?? [];
    if (!incoming.length) continue;
    const existing = await a.collect(env, dataDir).catch(() => []);
    const r = mergeCollection(existing, incoming, strategy);
    await a.apply(r.merged, env, dataDir);
    console.log(`  ${a.name}: +${r.added} added, ${r.skipped} skipped, ${r.renamed} renamed, ${r.overwritten} overwritten`);
  }
  console.log(`imported ${file} (collision: ${strategy})`);
  return 0;
}

export async function runWorkspaceCommand(repoRoot: string, rest: string[]): Promise<number> {
  const dataDir = dataDirFor(repoRoot);
  const sub = rest[0] ?? "export";
  if (sub === "export") return runExport(process.env, dataDir, rest.slice(1));
  if (sub === "import") return runImport(process.env, dataDir, rest.slice(1));
  console.error("usage: vanta workspace [export [file] | import <file> [--on-collision skip|rename|overwrite]]");
  return 1;
}
