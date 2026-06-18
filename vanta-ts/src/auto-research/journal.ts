import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AutoResearchIteration } from "./types.js";

export const AUTO_RESEARCH_JOURNAL = join(".vanta", "auto-research-journal.jsonl");

export function appendAutoResearchJournal(repoRoot: string, iteration: AutoResearchIteration, at: string): void {
  const path = join(repoRoot, AUTO_RESEARCH_JOURNAL);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify({ at, ...iteration }) + "\n", "utf8");
}
