import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import {
  appendWorld, readWorld, queryEntities, relationsOf,
  type WorldEntity, type WorldRelation,
} from "../world/store.js";

const Args = z.object({
  action: z.enum(["record", "relate", "query"]),
  id: z.string().optional(),
  type: z.string().optional(),
  name: z.string().optional(),
  note: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  rel: z.string().optional(),
  q: z.string().optional(),
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

async function doQuery(a: Parsed): Promise<ToolResult> {
  const recs = await readWorld();
  const found = queryEntities(recs, a.q ?? "");
  if (!found.length) return { ok: true, output: a.q ? `no entities match "${a.q}"` : "world model is empty — record entities first (action:record)" };
  return { ok: true, output: found.slice(0, 20).map((e) => formatEntity(e, relationsOf(recs, e.id))).join("\n") };
}

export const worldTool: Tool = {
  schema: {
    name: "world",
    description:
      "Vanta's world model: a durable graph of entities (people, projects, repos, companies, goals, accounts, commitments) " +
      "and their relationships, persisted across sessions. action:record adds/updates an entity (id, type, name, optional note/confidence); " +
      "action:relate links two entities (from, to, rel like owns/depends-on/blocked-by/promised-to/next-action-for); " +
      "action:query searches entities (q over type/name/note). Use it to remember and reason about the user's systems coherently.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["record", "relate", "query"], description: "record an entity | relate two | query" },
        id: { type: "string", description: "stable entity id slug (for record)" },
        type: { type: "string", description: "person | project | repo | company | goal | account | commitment | tool | asset" },
        name: { type: "string", description: "human name/label (for record)" },
        note: { type: "string", description: "optional detail" },
        confidence: { type: "number", description: "0..1 certainty (optional)" },
        from: { type: "string", description: "source entity id (for relate)" },
        to: { type: "string", description: "target entity id (for relate)" },
        rel: { type: "string", description: "owns | depends-on | blocked-by | promised-to | relevant-to | next-action-for" },
        q: { type: "string", description: "query string (for query; empty = all)" },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => `world ${String(a.action ?? "")}`,
  async execute(raw) {
    const p = Args.safeParse(raw);
    if (!p.success) return { ok: false, output: "world needs action: record | relate | query" };
    if (p.data.action === "record") return doRecord(p.data);
    if (p.data.action === "relate") return doRelate(p.data);
    return doQuery(p.data);
  },
};
