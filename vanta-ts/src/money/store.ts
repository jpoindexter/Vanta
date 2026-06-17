import { resolveMemoryStore } from "../store/memory-store.js";

// Structured money-making ledger — offers, prospects, revenue, deliverables, follow-ups.
// Append-only JSONL (~/.vanta/money.jsonl), global across projects.
// Latest-write-wins per id; pure query helpers.

export type Offer = { kind: "offer"; id: string; name: string; price?: string; note?: string; ts: string };
export type Prospect = { kind: "prospect"; id: string; name: string; stage: "lead" | "contacted" | "replied" | "booked" | "won" | "lost"; note?: string; ts: string };
export type Revenue = { kind: "revenue"; amount: number; source?: string; note?: string; ts: string };
export type Deliverable = { kind: "deliverable"; id: string; prospectId?: string; title: string; status: "todo" | "doing" | "done"; due?: string; created: string; updated: string };
export type Followup = { kind: "followup"; id: string; prospectId: string; note: string; due: string; done?: string; created: string; updated: string };
export type MoneyRecord = Offer | Prospect | Revenue | Deliverable | Followup;

export async function appendMoney(rec: MoneyRecord, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const store = resolveMemoryStore(env);
  await store.append("money.jsonl", JSON.stringify(rec) + "\n");
}

export async function readMoney(env: NodeJS.ProcessEnv = process.env): Promise<MoneyRecord[]> {
  const store = resolveMemoryStore(env);
  try {
    const raw = await store.read("money.jsonl");
    if (raw === null) return [];
    return raw
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
