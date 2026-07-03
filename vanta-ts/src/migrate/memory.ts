// CROSS-AGENT-MEMORY-UNIFY — the read-side complement to VANTA-MIGRATE. Ingest
// another agent's MEMORY store (Claude Code, Codex) into Vanta's brain, deduped
// against what's already there and provenance-tagged (sourceType "external" +
// sourceRef "<source>"), so recall surfaces the merged knowledge. Pure parse +
// plan here; the fs read + real brain write are injected at the CLI boundary so
// the whole thing is unit-tested offline against a fixture store.

export type AgentMemorySource = "claude-code" | "codex";
export const MEMORY_SOURCES = ["claude-code", "codex"] as const satisfies readonly AgentMemorySource[];

/** One candidate fact lifted from an external store, ready to remember(). */
export type MemoryFact = { content: string; region: string; sourceRef: string };

const BULLET_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;
const HEADING_RE = /^\s*#{1,6}\s+/;
const FENCE_RE = /^\s*(?:```|~~~)/;
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
/** Facts shorter than this are structural noise (labels, single words). */
const MIN_FACT_LEN = 8;
/** Imported cross-agent knowledge is factual — the brain's semantic region. */
const IMPORT_REGION = "semantic";

/** Drop a leading YAML frontmatter block, if present. Pure. */
function stripFrontmatter(text: string): string {
  const m = text.match(FRONTMATTER_RE);
  return m ? text.slice(m[0].length) : text;
}

/** Drop fenced code blocks — memory prose, not code, is what we ingest. Pure. */
function stripFencedBlocks(text: string): string {
  const out: string[] = [];
  let inFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (FENCE_RE.test(line)) { inFence = !inFence; continue; }
    if (!inFence) out.push(line);
  }
  return out.join("\n");
}

/**
 * Parse a markdown memory store into candidate facts: each bullet or prose line
 * becomes one fact (headings, code, frontmatter, and sub-threshold noise are
 * dropped; identical lines are collapsed). Tolerant by design — the store layout
 * is a convention, so anything that reads as a statement is captured. Pure.
 */
export function parseAgentMemory(text: string, sourceRef: string): MemoryFact[] {
  const body = stripFencedBlocks(stripFrontmatter(text));
  const facts: MemoryFact[] = [];
  const seen = new Set<string>();
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || HEADING_RE.test(trimmed)) continue;
    const content = trimmed.replace(BULLET_RE, "").trim();
    if (content.length < MIN_FACT_LEN) continue;
    const key = content.toLowerCase();
    if (seen.has(key)) continue; // in-file dedup
    seen.add(key);
    facts.push({ content, region: IMPORT_REGION, sourceRef });
  }
  return facts;
}

export type MemoryIngestPlan = { toImport: MemoryFact[]; duplicates: MemoryFact[] };

/**
 * Split parsed facts into new vs already-known, keying on the brain's own entry
 * id (region+content) so a re-import never duplicates what's stored. Pure.
 */
export function planMemoryIngest(
  facts: MemoryFact[],
  existingIds: Set<string>,
  idOf: (region: string, content: string) => string,
): MemoryIngestPlan {
  const toImport: MemoryFact[] = [];
  const duplicates: MemoryFact[] = [];
  for (const f of facts) {
    (existingIds.has(idOf(f.region, f.content)) ? duplicates : toImport).push(f);
  }
  return { toImport, duplicates };
}

/** The injected boundary: read the store, know what's stored, write the brain. */
export type MemoryIngestDeps = {
  /** External store text, or null if the store is absent. */
  read: (source: AgentMemorySource) => string | null;
  /** Ids already in the brain, so a re-import dedups. */
  existingIds: () => Promise<Set<string>>;
  /** Persist one fact as an external-provenance brain memory. */
  remember: (fact: MemoryFact) => Promise<void>;
  /** The brain's entry-id function (region+content → id). */
  idOf: (region: string, content: string) => string;
};

export type MemoryIngestResult = {
  source: AgentMemorySource;
  found: boolean;
  imported: number;
  deduped: number;
  importedFacts: string[];
};

/**
 * Read an external agent's memory store, dedup its facts against the brain, and
 * remember the new ones with external provenance. Errors-as-values: a missing
 * store returns found:false, never throws.
 */
export async function ingestAgentMemory(
  source: AgentMemorySource,
  deps: MemoryIngestDeps,
): Promise<MemoryIngestResult> {
  const text = deps.read(source);
  if (text === null) return { source, found: false, imported: 0, deduped: 0, importedFacts: [] };
  const facts = parseAgentMemory(text, source);
  const { toImport, duplicates } = planMemoryIngest(facts, await deps.existingIds(), deps.idOf);
  for (const f of toImport) await deps.remember(f);
  return {
    source,
    found: true,
    imported: toImport.length,
    deduped: duplicates.length,
    importedFacts: toImport.map((f) => f.content),
  };
}
