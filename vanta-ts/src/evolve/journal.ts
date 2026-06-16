import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { EvolveIteration } from "./types.js";

// Append-only record of every evolve iteration (kept or reverted, with the
// score delta + actual/predicted fixes + regressions) — the loop's audit trail
// and the input a future regression-foresight pass learns from.

export function appendJournal(path: string, it: EvolveIteration, at: string): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify({ at, ...it }) + "\n", "utf8");
}
