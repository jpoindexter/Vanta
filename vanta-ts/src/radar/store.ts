import { appendFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

// Vanta's opportunity radar — a durable, append-only ledger of scored business
// opportunities (pain + buyer signals). Append-only JSONL; latest-write-wins
// per id. Pure query helpers for ranking and filtering.

export type Opportunity = {
  kind: "opportunity";
  id: string;
  title: string;
  source?: string;
  /** 0..1 — how painful/expensive/urgent/repeated the problem is. */
  pain?: number;
  /** 0..1 — how reachable/budgeted/ready the buyer is. */
  buyer?: number;
  note?: string;
  status: "new" | "testing" | "validated" | "dropped";
  ts: string;
};

function radarPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "radar.jsonl");
}

export async function appendRadar(rec: Opportunity, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  await appendFile(radarPath(env), JSON.stringify(rec) + "\n", "utf8");
}

export async function readRadar(env: NodeJS.ProcessEnv = process.env): Promise<Opportunity[]> {
  try {
    return (await readFile(radarPath(env), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Opportunity);
  } catch {
    return [];
  }
}

/** Latest opportunity per id (append-only → last write wins). Pure. */
export function latestOpportunities(recs: Opportunity[]): Opportunity[] {
  const byId = new Map<string, Opportunity>();
  for (const o of recs) byId.set(o.id, o);
  return [...byId.values()];
}

/** Composite score: pain + buyer (0..2). Pure. */
export function score(o: Opportunity): number {
  return (o.pain ?? 0) + (o.buyer ?? 0);
}

/** Latest opportunities sorted by score descending. Pure. */
export function ranked(recs: Opportunity[]): Opportunity[] {
  return latestOpportunities(recs).sort((a, b) => score(b) - score(a));
}

/** Filter latest opportunities by status. Pure. */
export function byStatus(recs: Opportunity[], status: Opportunity["status"]): Opportunity[] {
  return latestOpportunities(recs).filter((o) => o.status === status);
}
