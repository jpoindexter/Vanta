import { readNextItems } from "./next.js";
import { topNextItems, formatChoiceList } from "./choice-reduce.js";
import type { ReplCtx, SlashHandler } from "./types.js";

// VANTA-SUGGESTIONS — proactive operator polish: a concise resume recap (done /
// in-progress / next) and a DETERMINISTIC ranked next-step suggestion on request
// (distinct from /next, which asks the model). Pure formatting + ranking; the
// handler gathers goals/backlog/in-progress and feeds these.

export type RecapInput = {
  /** Recently completed work (e.g. last commit subjects / done goals). */
  doneRecent: string[];
  /** Work started but not finished (open goals, ralph-loop features, uncommitted writes). */
  inProgress: string[];
  /** The single most concrete next step, if one is known. */
  next: string | null;
};

const bullets = (items: string[], empty: string): string =>
  items.length ? items.map((x) => `  · ${x}`).join("\n") : `  · ${empty}`;

/** A compact three-section resume recap. Pure. */
export function formatRecap(input: RecapInput): string {
  return [
    "Recap — where you left off",
    "Done recently:",
    bullets(input.doneRecent.slice(0, 3), "nothing recorded"),
    "In progress:",
    bullets(input.inProgress.slice(0, 3), "nothing open"),
    `Next: ${input.next ?? "— (no active goal; set one with /goal)"}`,
  ].join("\n");
}

export type BacklogItem = { id: string; title: string; size: string };
export type Suggestion = { text: string; reason: string; kind: "resume" | "ship" | "goal" };

const SIZE_RANK: Record<string, number> = { S: 0, M: 1, L: 2 };
const sizeRank = (s: string): number => SIZE_RANK[s.toUpperCase()] ?? 1;

export type SuggestInput = {
  inProgress: string[];
  backlog: BacklogItem[];
  activeGoals: string[];
};

/**
 * Rank next-step suggestions deterministically, best-first, capped at 3:
 *   1. FINISH what's started (in-progress work) — closing beats opening.
 *   2. SHIP the smallest ready backlog item (pebble-first — momentum).
 *   3. Advance an active goal that has no in-progress work yet.
 * Pure. Empty when there's nothing to suggest.
 */
export function rankSuggestions(input: SuggestInput): Suggestion[] {
  const out: Suggestion[] = [];
  for (const item of input.inProgress) {
    out.push({ text: `Finish: ${item}`, reason: "in progress — close it before starting new work", kind: "resume" });
  }
  const readied = [...input.backlog].sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
  for (const b of readied) {
    out.push({ text: `Ship [${b.id}] ${b.title}`, reason: `smallest ready item (${b.size}) — quickest win`, kind: "ship" });
  }
  if (input.inProgress.length === 0) {
    for (const g of input.activeGoals) {
      out.push({ text: `Advance goal: ${g}`, reason: "active goal with no work started", kind: "goal" });
    }
  }
  return out.slice(0, 3);
}

/** Render ranked suggestions for display (numbered, with the reason). Pure. */
export function formatSuggestions(suggestions: Suggestion[]): string {
  if (suggestions.length === 0) return "No suggestions — no active goals, in-progress work, or ready backlog.";
  const lines = suggestions.map((s, i) => `  ${i + 1}. ${s.text}\n     ↳ ${s.reason}`);
  return `Suggested next steps:\n${lines.join("\n")}`;
}

/** Compose the recap + ranked-suggestions view from gathered REPL state. Pure. */
export function buildSuggestView(o: { done: string[]; active: string[]; backlog: BacklogItem[] }): string {
  const suggestions = rankSuggestions({ inProgress: o.active, backlog: o.backlog, activeGoals: o.active });
  const recap = formatRecap({ doneRecent: o.done, inProgress: o.active, next: suggestions[0]?.text ?? null });
  return `${recap}\n\n${formatSuggestions(suggestions)}`;
}

type GoalRow = { status: string; text: string };
/** Gather goals + backlog, split done/active + top backlog. Shared by the
 * handler and the resume recap. Injected getGoals keeps it testable. */
async function gatherSuggestState(getGoals: () => Promise<GoalRow[]>, dataDir: string): Promise<{ done: string[]; active: string[]; backlog: BacklogItem[] }> {
  const goals = await getGoals().catch(() => []);
  const backlog = topNextItems(await readNextItems(dataDir).catch(() => [])).map((i) => ({ id: i.id, title: i.title, size: i.size }));
  return {
    done: goals.filter((g) => g.status === "done").map((g) => g.text),
    active: goals.filter((g) => g.status === "active").map((g) => g.text),
    backlog,
  };
}

/** `/suggest [all]` — deterministic recap + ranked next-step (no model turn).
 * `all` shows the FULL backlog (ND-CHOICE-REDUCE: full list on request). */
export const suggest: SlashHandler = async (arg, ctx: ReplCtx) => {
  const s = await gatherSuggestState(() => ctx.setup.safety.getGoals(), ctx.dataDir);
  if (arg.trim() === "all") {
    const items = await readNextItems(ctx.dataDir).catch(() => []);
    return { output: `${buildSuggestView(s)}\n\nFull backlog (${items.length}):\n${formatChoiceList(items, { all: true })}` };
  }
  return { output: `${buildSuggestView(s)}\n\nBacklog:\n${formatChoiceList(await readNextItems(ctx.dataDir).catch(() => []), { hint: "/suggest all" })}` };
};

/** The recap-only view shown automatically on session resume (VANTA-SUGGESTIONS
 * done-clause: "on resume Vanta shows a recap"). Best-effort; never throws. */
export async function resumeRecap(o: { getGoals: () => Promise<GoalRow[]>; dataDir: string }): Promise<string> {
  const s = await gatherSuggestState(o.getGoals, o.dataDir);
  const next = rankSuggestions({ inProgress: s.active, backlog: s.backlog, activeGoals: s.active })[0]?.text ?? null;
  return formatRecap({ doneRecent: s.done, inProgress: s.active, next });
}
