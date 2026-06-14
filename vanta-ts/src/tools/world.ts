import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import {
  appendWorld, readWorld, queryEntities, relationsOf,
  latestEntities, relations,
  type WorldEntity, type WorldRelation,
} from "../world/store.js";
import { findConflicts, recallWithSources, type CitedMatch } from "../world/conflicts.js";
import { mergeEntities, mergeRecords, findDuplicates } from "../world/merge.js";

const Args = z.object({
  action: z.enum(["record", "relate", "query", "conflicts", "merge", "duplicates"]),
  id: z.string().optional(),
  type: z.string().optional(),
  name: z.string().optional(),
  note: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  rel: z.string().optional(),
  q: z.string().optional(),
  keepId: z.string().optional(),
  dropId: z.string().optional(),
});
type Parsed = z.infer<typeof Args>;

async function doRecord(a: Parsed): Promise<ToolResult> {
  if (!a.id || !a.type || !a.name) return { ok: false, output: "record needs id, type, name" };
  await appendWorld({ kind: "entity", id: a.id, type: a.type, name: a.name, note: a.note, confidence: a.confidence, ts: new Date().toISOString() });
  return { ok: true, output: `recorded ${a.type}:${a.id} — ${a.name}` };
}

async function doRelate(a: Parsed): Promise<ToolResult> {
  if (!a.from || !a.to || !a.rel) return { ok: false, output: "relate needs from, to, rel" };
  await appendWorld({ kind: "relation", from: a.from, to: a.to, rel: a.rel, ts: new Date().toISOString() });
  return { ok: true, output: `related ${a.from} —${a.rel}→ ${a.to}` };
}

function formatEntity(e: WorldEntity, rels: WorldRelation[]): string {
  const conf = e.confidence !== undefined ? ` (${Math.round(e.confidence * 100)}%)` : "";
  const relStr = rels.length ? `  [${rels.map((r) => (r.from === e.id ? `${r.rel}→${r.to}` : `${r.from}→${r.rel}`)).join(", ")}]` : "";
  return `${e.type}:${e.id} — ${e.name}${e.note ? ` · ${e.note}` : ""}${conf}${relStr}`;
}

function formatCited(match: CitedMatch): string {
  return `  ${match.text}  [source:${match.ts}]`;
}

async function doQuery(a: Parsed): Promise<ToolResult> {
  const recs = await readWorld();
  const q = a.q ?? "";
  if (!q) {
    const found = queryEntities(recs, "");
    if (!found.length) return { ok: true, output: "world model is empty — record entities first (action:record)" };
    return { ok: true, output: found.slice(0, 20).map((e) => formatEntity(e, relationsOf(recs, e.id))).join("\n") };
  }
  const ents = latestEntities(recs);
  const rels = relations(recs);
  const cited = recallWithSources(ents, rels, q);
  if (!cited.length) return { ok: true, output: `no entities match "${q}"` };
  return { ok: true, output: cited.slice(0, 20).map(formatCited).join("\n") };
}

async function doConflicts(): Promise<ToolResult> {
  const recs = await readWorld();
  const rels = relations(recs);
  const cs = findConflicts(rels);
  if (!cs.length) return { ok: true, output: "no conflicts detected in world model" };
  const lines = cs.map(
    (c) => `⚠ ${c.subject} —${c.predicate}→ [${c.objects.join(" | ")}]  (${c.recordIds.length} records)`,
  );
  return { ok: true, output: `${cs.length} conflict(s):\n${lines.join("\n")}` };
}

async function doMerge(a: Parsed): Promise<ToolResult> {
  if (!a.keepId || !a.dropId) return { ok: false, output: "merge needs keepId and dropId" };
  if (a.keepId === a.dropId) return { ok: false, output: "keepId and dropId must differ" };
  const recs = await readWorld();
  const result = mergeEntities(recs, a.keepId, a.dropId);
  for (const rec of mergeRecords(result)) await appendWorld(rec);
  const count = result.repointed.length;
  return { ok: true, output: `merged ${a.dropId} → ${a.keepId} (${count} relation(s) re-pointed; ${a.dropId} tombstoned as alias)` };
}

async function doDuplicates(): Promise<ToolResult> {
  const recs = await readWorld();
  const ents = latestEntities(recs);
  const pairs = findDuplicates(ents);
  if (!pairs.length) return { ok: true, output: "no duplicate entities detected" };
  const lines = pairs.map(([k, d]) => `  ${d} → merge into ${k}`);
  return { ok: true, output: `${pairs.length} possible duplicate(s):\n${lines.join("\n")}` };
}

export const worldTool: Tool = {
  schema: {
    name: "world",
    description:
      "Vanta's world model: a durable graph of entities (people, projects, repos, companies, goals, accounts, commitments) " +
      "and their relationships, persisted across sessions. action:record adds/updates an entity (id, type, name, optional note/confidence); " +
      "action:relate links two entities (from, to, rel like owns/depends-on/blocked-by/promised-to/next-action-for); " +
      "action:query searches entities with source citations (q over type/name/note/relation); " +
      "action:conflicts lists contradictions (same subject+predicate with different objects); " +
      "action:duplicates suggests entity pairs with same type+name for merging; " +
      "action:merge consolidates dropId into keepId (re-points relations, tombstones the drop). Use it to remember and reason about the user's systems coherently.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["record", "relate", "query", "conflicts", "merge", "duplicates"], description: "record | relate | query (cited) | conflicts | merge (consolidate) | duplicates (suggest merges)" },
        id: { type: "string", description: "stable entity id slug (for record)" },
        type: { type: "string", description: "person | project | repo | company | goal | account | commitment | tool | asset" },
        name: { type: "string", description: "human name/label (for record)" },
        note: { type: "string", description: "optional detail" },
        confidence: { type: "number", description: "0..1 certainty (optional)" },
        from: { type: "string", description: "source entity id (for relate)" },
        to: { type: "string", description: "target entity id (for relate)" },
        rel: { type: "string", description: "owns | depends-on | blocked-by | promised-to | relevant-to | next-action-for" },
        q: { type: "string", description: "query string (for query; empty = all without citations)" },
        keepId: { type: "string", description: "surviving entity id (for merge)" },
        dropId: { type: "string", description: "entity id to consolidate away (for merge)" },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => {
    if (a.action === "merge") return `world merge ${String(a.keepId ?? "")} ← ${String(a.dropId ?? "")}`;
    return `world ${String(a.action ?? "")}`;
  },
  async execute(raw) {
    const p = Args.safeParse(raw);
    if (!p.success) return { ok: false, output: "world needs action: record | relate | query | conflicts" };
    if (p.data.action === "record") return doRecord(p.data);
    if (p.data.action === "relate") return doRelate(p.data);
    if (p.data.action === "conflicts") return doConflicts();
    if (p.data.action === "merge") return doMerge(p.data);
    if (p.data.action === "duplicates") return doDuplicates();
    return doQuery(p.data);
  },
};
