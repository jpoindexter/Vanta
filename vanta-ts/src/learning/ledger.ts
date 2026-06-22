import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// VANTA-SELF-LEARNING-LOOP — the reuse/improvement metric that makes the loop
// LEGIBLE. Every self-learning cycle appends one row here; `/learning` reads it
// back as operator-facing stats. Durable + greppable at .vanta/learning/ledger.jsonl,
// like .vanta/bugs and .vanta/feedback.

/** What a single event records. `minted` = a brand-new skill; `refined` = re-wrote
 *  an existing learned skill (the "improved over a session" signal); `reused` = a
 *  learned skill was recalled into a later task (the live reuse signal). `adopted`
 *  is false when the eval-gate rejected a proposed skill (then it was archived). */
export type LearningEvent = {
  ts: string;
  skill: string;
  kind: "minted" | "refined" | "reused";
  adopted: boolean;
  reason: string;
};

const KINDS: ReadonlySet<string> = new Set(["minted", "refined", "reused"]);

const LEDGER_REL = join("learning", "ledger.jsonl");

const ledgerPath = (dataDir: string): string => join(dataDir, LEDGER_REL);

/** Append one cycle outcome. Best-effort: a write failure never breaks a turn. */
export async function recordLearning(dataDir: string, event: LearningEvent): Promise<void> {
  const path = ledgerPath(dataDir);
  try {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
  } catch {
    /* metric persistence is best-effort */
  }
}

/** Read every recorded cycle, newest last. Tolerant: bad lines are skipped, a
 *  missing file is an empty history. */
export async function readLearning(dataDir: string): Promise<LearningEvent[]> {
  let raw: string;
  try {
    raw = await readFile(ledgerPath(dataDir), "utf8");
  } catch {
    return [];
  }
  const out: LearningEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as LearningEvent;
      if (e && typeof e.skill === "string" && KINDS.has(e.kind)) out.push(e);
    } catch {
      /* skip a corrupt row, keep the rest */
    }
  }
  return out;
}

export type LearningStats = {
  /** Propose cycles (minted + refined) — excludes reuse events. */
  cycles: number;
  minted: number;
  refined: number;
  adopted: number;
  rejected: number;
  /** Share of proposed skills that passed the eval-gate (0..1, or null if none). */
  adoptionRate: number | null;
  /** Times a learned skill was recalled into a later task — the live reuse metric. */
  reused: number;
  /** Distinct learned skills touched — the breadth of what the loop has captured. */
  distinctSkills: number;
};

/** Summarise the ledger. Pure. Reuse events are counted separately from the
 *  propose cycles so adoption stats stay about proposals, reuse about recall. */
export function learningStats(events: LearningEvent[]): LearningStats {
  const cycles = events.filter((e) => e.kind !== "reused");
  const adopted = cycles.filter((e) => e.adopted);
  return {
    cycles: cycles.length,
    minted: cycles.filter((e) => e.kind === "minted").length,
    refined: cycles.filter((e) => e.kind === "refined").length,
    adopted: adopted.length,
    rejected: cycles.length - adopted.length,
    adoptionRate: cycles.length ? adopted.length / cycles.length : null,
    reused: events.filter((e) => e.kind === "reused").length,
    distinctSkills: new Set(events.map((e) => e.skill)).size,
  };
}
