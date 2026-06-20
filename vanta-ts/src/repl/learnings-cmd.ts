import { dirname } from "node:path";
import { addLearning, listLearnings, LEARNING_KINDS, LearningKindSchema, type Learning } from "../learnings/store.js";
import { relevantLearnings, flagStale, findConflicts } from "../learnings/relevance.js";
import { oneLine } from "./format.js";
import type { ReplCtx, SlashResult, SlashHandler } from "./types.js";

// LEARNINGS-INDEX: /learnings — the operator surface for the per-project typed
// insights index. `add` captures a learning; `list` shows all live ones with
// stale/conflict flags; bare/`relevant` shows the same top-N the session start
// injects. The index itself + scoring are owned by ../learnings/*; this is view.

const USAGE = [
  "  usage:",
  "    /learnings                      most relevant learnings (what the session injects)",
  "    /learnings list                 all live learnings (stale/conflicting flagged)",
  `    /learnings add <kind>: <text>   capture one (kind: ${LEARNING_KINDS.join(" | ")})`,
].join("\n");

function flagsFor(l: Learning, staleIds: Set<string>, conflictIds: Set<string>): string {
  const marks = [staleIds.has(l.id) ? "⚠ stale" : "", conflictIds.has(l.id) ? "⚠ conflicting" : ""].filter(Boolean);
  return marks.length ? `  (${marks.join("; ")})` : "";
}

function renderRows(rows: Learning[], all: Learning[], now: number): string {
  const staleIds = new Set(flagStale(all, now).map((s) => s.learning.id));
  const conflictIds = new Set(findConflicts(all).flatMap((c) => [c.a.id, c.b.id]));
  return rows
    .map((l) => {
      const tags = l.tags.length ? ` [${l.tags.join(", ")}]` : "";
      return `  ${l.kind.padEnd(11)}${oneLine(l.text, 80)}${tags}${flagsFor(l, staleIds, conflictIds)}`;
    })
    .join("\n");
}

/** Parse "<kind>: <text>" → a NewLearning, or an error string. Pure. */
function parseAdd(arg: string): { kind: Learning["kind"]; text: string } | string {
  const sep = arg.indexOf(":");
  if (sep < 0) return `  add needs "<kind>: <text>" — e.g. /learnings add gotcha: run git from repo root`;
  const kindRaw = arg.slice(0, sep).trim().toLowerCase();
  const text = arg.slice(sep + 1).trim();
  if (!text) return "  add needs some text after the kind";
  const parsed = LearningKindSchema.safeParse(kindRaw);
  if (!parsed.success) return `  unknown kind "${kindRaw}" — use one of: ${LEARNING_KINDS.join(", ")}`;
  return { kind: parsed.data, text };
}

async function handleAdd(arg: string, ctx: ReplCtx): Promise<SlashResult> {
  const parsed = parseAdd(arg);
  if (typeof parsed === "string") return { output: parsed };
  const l = await addLearning(ctx.dataDir, parsed, ctx.now().getTime());
  return { output: `  ◈ learned (${l.kind}): ${oneLine(l.text, 80)}` };
}

async function handleList(ctx: ReplCtx): Promise<SlashResult> {
  const all = await listLearnings(ctx.dataDir);
  const live = all.filter((l) => !l.supersededBy);
  if (!live.length) return { output: "  (no learnings yet — /learnings add <kind>: <text>)" };
  return { output: `  ${live.length} learning(s):\n${renderRows(live, all, ctx.now().getTime())}` };
}

async function handleRelevant(ctx: ReplCtx): Promise<SlashResult> {
  const all = await listLearnings(ctx.dataDir);
  if (!all.length) return { output: "  (no learnings yet — /learnings add <kind>: <text>)" };
  const now = ctx.now().getTime();
  const top = relevantLearnings(all, dirname(ctx.dataDir), 3, { now });
  if (!top.length) return { output: "  (no relevant learnings)" };
  return { output: `  most relevant:\n${renderRows(top, all, now)}` };
}

/** /learnings — view/add the per-project typed learnings index. */
export const learnings: SlashHandler = async (arg, ctx: ReplCtx): Promise<SlashResult> => {
  const trimmed = arg.trim();
  const [sub, ...rest] = trimmed.split(/\s+/);
  const verb = (sub ?? "").toLowerCase();
  if (verb === "add") return handleAdd(rest.join(" "), ctx);
  if (verb === "list") return handleList(ctx);
  if (verb === "help") return { output: USAGE };
  if (!trimmed || verb === "relevant") return handleRelevant(ctx);
  return { output: USAGE };
};
