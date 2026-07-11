import { ingestCorpus, type IngestDeps } from "../corpus/ingest.js";
import { recallCorpus } from "../corpus/recall.js";
import { corpusStatus, refreshCorpus } from "../corpus/refresh.js";
import { exportCorpusVault } from "../corpus/vault.js";
import type { Embedder } from "../corpus/schema.js";

type CorpusCommandDeps = IngestDeps & { log?: (line: string) => void; embedder?: Embedder };
const USAGE = "Usage: vanta corpus ingest <folder|url> | recall <query> [--limit N] | status | refresh <id|all> | vault-export --vault <dir> [--apply]";

export async function runCorpusCommand(args: string[], deps: CorpusCommandDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  try {
    const handlers: Record<string, () => Promise<number>> = {
      ingest: () => runIngest(args[1], deps, log),
      recall: () => runRecall(args, deps, log),
      status: () => runStatus(deps, log),
      refresh: () => runRefresh(args[1], deps, log),
      "vault-export": () => runVault(args, deps, log),
    };
    const handler = handlers[args[0] ?? ""];
    if (handler) return handler();
  } catch (error) {
    log(`Corpus error: ${(error as Error).message}`);
    return 1;
  }
  log(USAGE);
  return 1;
}

async function runIngest(target: string | undefined, deps: CorpusCommandDeps, log: (line: string) => void): Promise<number> {
  if (!target) { log(USAGE); return 1; }
  const result = await ingestCorpus(target, deps);
  log(`Imported ${result.imported} source${result.imported === 1 ? "" : "s"}; skipped ${result.skipped}.`);
  for (const source of result.sources) log(`- ${source.id} ${source.title} (${source.freshness})`);
  return 0;
}

async function runRecall(args: string[], deps: CorpusCommandDeps, log: (line: string) => void): Promise<number> {
  const limitAt = args.indexOf("--limit");
  const limit = limitAt >= 0 ? Number(args[limitAt + 1] ?? 5) : 5;
  const query = args.slice(1, limitAt >= 0 ? limitAt : undefined).join(" ");
  if (!query) { log(USAGE); return 1; }
  const result = await recallCorpus(query, { env: deps.env, embedder: deps.embedder, limit });
  log(`Signals: ${result.signals.join(" + ") || "none"}`);
  for (const hit of result.hits) {
    log(`\n${hit.source.title}\n${hit.excerpt}\nsource: ${hit.receipt.source}\ndate: ${hit.receipt.date}\nfreshness: ${hit.receipt.freshness}`);
  }
  if (!result.hits.length) log("No corpus matches.");
  return 0;
}

async function runStatus(deps: CorpusCommandDeps, log: (line: string) => void): Promise<number> {
  const status = await corpusStatus({ env: deps.env });
  log(`${status.total} source${status.total === 1 ? "" : "s"}: ${status.fresh} fresh, ${status.stale} stale.`);
  for (const source of status.sources) log(`- ${source.id} ${source.title} (${source.freshness})`);
  return 0;
}

async function runRefresh(id: string | undefined, deps: CorpusCommandDeps, log: (line: string) => void): Promise<number> {
  if (!id) { log(USAGE); return 1; }
  const result = await refreshCorpus(id, deps);
  log(`Refreshed ${result.refreshed} source${result.refreshed === 1 ? "" : "s"}.`);
  return 0;
}

async function runVault(args: string[], deps: CorpusCommandDeps, log: (line: string) => void): Promise<number> {
  const at = args.indexOf("--vault");
  const vault = at >= 0 ? args[at + 1] : undefined;
  if (!vault) { log(USAGE); return 1; }
  const result = await exportCorpusVault(vault, { env: deps.env, apply: args.includes("--apply") });
  log(`${args.includes("--apply") ? "Applied" : "Preview"}: ${result.changed.length} vault file${result.changed.length === 1 ? "" : "s"} changed.`);
  if (!args.includes("--apply")) log(result.diff);
  return 0;
}
