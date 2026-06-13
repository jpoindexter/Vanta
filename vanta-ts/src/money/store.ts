import { appendFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

// Structured money-making ledger — offers, prospects, and revenue.
// Append-only JSONL (~/.vanta/money.jsonl), global across projects.
// Latest-write-wins per prospect id; pure query helpers.

export type Offer = { kind: "offer"; id: string; name: string; price?: string; note?: string; ts: string };
export type Prospect = { kind: "prospect"; id: string; name: string; stage: "lead" | "contacted" | "replied" | "booked" | "won" | "lost"; note?: string; ts: string };
export type Revenue = { kind: "revenue"; amount: number; source?: string; note?: string; ts: string };
export type MoneyRecord = Offer | Prospect | Revenue;

function moneyPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "money.jsonl");
}

export async function appendMoney(rec: MoneyRecord, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  await appendFile(moneyPath(env), JSON.stringify(rec) + "\n", "utf8");
}

export async function readMoney(env: NodeJS.ProcessEnv = process.env): Promise<MoneyRecord[]> {
  try {
    return (await readFile(moneyPath(env), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as MoneyRecord);
  } catch {
    return [];
  }
}

const isOffer = (r: MoneyRecord): r is Offer => r.kind === "offer";
const isProspect = (r: MoneyRecord): r is Prospect => r.kind === "prospect";
const isRevenue = (r: MoneyRecord): r is Revenue => r.kind === "revenue";

/** Latest prospect per id (append-only → last write wins). Pure. */
export function latestProspects(recs: MoneyRecord[]): Prospect[] {
  const byId = new Map<string, Prospect>();
  for (const p of recs.filter(isProspect)) byId.set(p.id, p);
  return [...byId.values()];
}

/** All offer records (each append is a new entry). Pure. */
export function offers(recs: MoneyRecord[]): Offer[] {
  return recs.filter(isOffer);
}

/** Sum of all revenue amounts. Pure. */
export function revenueTotal(recs: MoneyRecord[]): number {
  return recs.filter(isRevenue).reduce((sum, r) => sum + r.amount, 0);
}

/** Count of latest prospects grouped by stage. Pure. */
export function pipelineByStage(recs: MoneyRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of latestProspects(recs)) {
    counts[p.stage] = (counts[p.stage] ?? 0) + 1;
  }
  return counts;
}
