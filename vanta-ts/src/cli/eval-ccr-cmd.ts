import { join } from "node:path";
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { analyzeCcrUsage, formatCcrUsage, type CcrUsage } from "../compress/ccr-stats.js";

// `vanta eval ccr` — the empirical input to CCR-DISPOSITION. Reads the live event
// log + the .vanta/ccr stash store, computes the whole-retrieve rate, prints the
// keep/scope/retire verdict, and writes docs/ccr-offload.md. No model, no network.

function readEvents(dataDir: string): { event?: string }[] {
  const f = join(dataDir, "events.jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as { event?: string }];
      } catch {
        return [];
      }
    });
}

function countStashes(dataDir: string): number {
  const dir = join(dataDir, "ccr");
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((n) => n.endsWith(".txt")).length;
}

function renderDoc(u: CcrUsage, events: number): string {
  const pct = (u.wholeRetrieveRate * 100).toFixed(1);
  return `# CCR offload disposition

Measured by \`vanta eval ccr\` over this install's live \`.vanta/events.jsonl\` + \`.vanta/ccr\` store. Re-run anytime to refresh.

| metric | value |
|---|--:|
| events scanned | ${events} |
| stashed originals (.vanta/ccr) | ${u.stashCount} |
| retrieve_original calls | ${u.retrieveCalls} |
| result-offload deliveries (>50K grep-pointer path) | ${u.offloadDeliveries} |
| **whole-retrieve rate** (retrieves / stashes) | **${pct}%** |
| **verdict** | **${u.verdict.toUpperCase()}** |

## Reading

The whole-retrieve rate is the deciding signal. Vanta's CCR makes re-expansion **optional** (an \`original_id\` in a footer), unlike the forced full-retrieve that made CCR net-negative in NousResearch/hermes-agent PR #47866. A **low** rate means the compressed/skeletoned view sufficed and CCR saved tokens; a **high** rate means the agent pulls originals back whole and pays the double-context tax.

- **keep** (<1/3): compressed view usually sufficed — CCR nets positive on the live tool path.
- **scope** (1/3–2/3): restrict CCR to history-compaction, off the live tool path.
- **retire** (≥2/3): the double-context tax dominates — drop CCR from the live tool path.

## Caveat

Single-install sample; result-offload (the >50K path) fires rarely, so most stashes come from the code-skeleton + JSON-view compressors. Treat the verdict as directional and re-run as usage grows.
`;
}

export async function runEvalCcrCommand(repoRoot: string): Promise<void> {
  const dataDir = join(repoRoot, ".vanta");
  const events = readEvents(dataDir);
  const usage = analyzeCcrUsage(events, countStashes(dataDir));
  console.log("vanta eval ccr — CCR offload disposition signal\n");
  console.log(formatCcrUsage(usage));
  const docsDir = join(repoRoot, "docs");
  mkdirSync(docsDir, { recursive: true });
  const doc = join(docsDir, "ccr-offload.md");
  writeFileSync(doc, renderDoc(usage, events.length), "utf8");
  console.log(`\nfindings → ${doc}`);
}
