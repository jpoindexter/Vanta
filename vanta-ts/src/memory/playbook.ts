import { z } from "zod";
import { join } from "node:path";
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolveVantaHome } from "../store/home.js";

// Cross-session experiential playbook: reusable strategies learned across runs.
// Sits between static SOUL.md/CLAUDE.md and transient transcripts — durable
// procedures that carry forward. Matching plays are injected into the prompt
// volatile tier so the agent benefits from prior experience on similar tasks.

export const PlaySchema = z.object({
  id: z.string(),
  task: z.string(),       // task context / situation
  strategy: z.string(),   // what approach worked
  outcome: z.string(),    // brief result summary
  tags: z.array(z.string()).default([]),
  useCount: z.number().int().default(0),
  created: z.number(),
  updated: z.number(),
});
export type Play = z.infer<typeof PlaySchema>;

function storePath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "playbook.jsonl");
}

export function appendPlay(
  play: Omit<Play, "id" | "useCount" | "created" | "updated">,
  env: NodeJS.ProcessEnv = process.env,
): Play {
  const now = Date.now();
  const entry: Play = { id: randomUUID(), useCount: 0, created: now, updated: now, ...play };
  appendFileSync(storePath(env), JSON.stringify(entry) + "\n");
  return entry;
}

/** Tolerant reader: drops corrupt lines; latest record per id wins. */
export function loadPlays(env: NodeJS.ProcessEnv = process.env): Play[] {
  const path = storePath(env);
  if (!existsSync(path)) return [];
  const all: Play[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = PlaySchema.safeParse(JSON.parse(line));
      if (r.success) all.push(r.data);
    } catch { /* skip corrupt line */ }
  }
  const byId = new Map<string, Play>();
  for (const p of all) byId.set(p.id, p);
  return [...byId.values()].sort((a, b) => b.updated - a.updated);
}

/** Pure: rank plays by query token overlap + use count; return top-K. */
export function matchingPlays(query: string, plays: Play[], topK = 3): Play[] {
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (!tokens.length) return plays.slice(0, topK);
  return plays
    .map((p) => {
      const corpus = `${p.task} ${p.strategy} ${p.tags.join(" ")}`.toLowerCase();
      const score = tokens.filter((t) => corpus.includes(t)).length;
      return { p, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.p.useCount - a.p.useCount)
    .slice(0, topK)
    .map(({ p }) => p);
}

export function formatPlay(p: Play): string {
  const tags = p.tags.length ? ` [${p.tags.join(", ")}]` : "";
  return `• Task: ${p.task}${tags}\n  Strategy: ${p.strategy}\n  Outcome: ${p.outcome}`;
}

/** Prompt-injection digest — empty string when nothing matches (no noise). */
export async function playbookDigest(
  instruction: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  try {
    const plays = loadPlays(env);
    const matches = matchingPlays(instruction, plays);
    if (!matches.length) return "";
    return `Playbook — strategies from prior sessions:\n${matches.map(formatPlay).join("\n")}`;
  } catch { return ""; }
}
