import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// VANTA-SELF-LEARNING-LOOP — the reuse/improvement metric that makes the loop
// LEGIBLE. Every self-learning cycle appends one row here; `/learning` reads it
// back as operator-facing stats. Durable + greppable at .vanta/learning/ledger.jsonl,
// like .vanta/bugs and .vanta/feedback.

/** What a single cycle did. `minted` = a brand-new skill; `refined` = re-wrote an
 *  existing learned skill (the "improved over a session" signal). `adopted` is
 *  false when the eval-gate rejected it (then it was archived). */
export type LearningEvent = {
  ts: string;
  skill: string;
  kind: "minted" | "refined";
  adopted: boolean;
  reason: string;
};

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
      if (e && typeof e.skill === "string" && (e.kind === "minted" || e.kind === "refined")) out.push(e);
    } catch {
      /* skip a corrupt row, keep the rest */
    }
  }
  return out;
}

export type LearningStats = {
  cycles: number;
  minted: number;
  refined: number;
  adopted: number;
  rejected: number;
  /** Share of proposed skills that passed the eval-gate (0..1, or null if none). */
  adoptionRate: number | null;
  /** Distinct learned skills touched — the breadth of what the loop has captured. */
  distinctSkills: number;
};

/** Summarise the ledger. Pure. */
export function learningStats(events: LearningEvent[]): LearningStats {
  const adopted = events.filter((e) => e.adopted);
  return {
    cycles: events.length,
    minted: events.filter((e) => e.kind === "minted").length,
    refined: events.filter((e) => e.kind === "refined").length,
    adopted: adopted.length,
    rejected: events.length - adopted.length,
    adoptionRate: events.length ? adopted.length / events.length : null,
    distinctSkills: new Set(events.map((e) => e.skill)).size,
  };
}
