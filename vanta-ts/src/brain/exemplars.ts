import { remember, recall } from "./brain.js";
import type { BrainEntry } from "./entries.js";

// Best-of exemplar library — context-level rejection sampling.
//
// A won tournament / loop result is the BEST output for a task; storing it as a
// crystallized brain entry means a later SIMILAR task can pull the top-K winners
// in as few-shot context — the model behaves better with no weight updates. This
// rides the brain's existing similarity/recall + retrieval-reinforcement: recall
// reinforces the exemplars it uses, so the ones that keep helping get stronger.
//
// Best-effort like the rest of brain: a store/recall failure degrades to a value
// (false / empty), it never throws across the boundary.

/** Exemplars live in semantic memory (durable learned knowledge), tagged on content. */
const EXEMPLAR_REGION = "semantic";
/** Content marker so exemplars are distinguishable from ordinary semantic facts. */
const EXEMPLAR_TAG = "[exemplar]";
const TASK_LABEL = "task:";
const WIN_LABEL = "win:";
const DEFAULT_RECALL_K = 3;

/** Compose the stored content: tagged, with the task (drives similarity) then the winning output. */
function composeContent(taskDesc: string, winningOutput: string): string {
  return `${EXEMPLAR_TAG} ${TASK_LABEL} ${taskDesc.trim()}\n${WIN_LABEL} ${winningOutput.trim()}`;
}

/** True when a brain entry is one of ours (tag in content). Pure. */
export function isExemplar(entry: BrainEntry): boolean {
  return entry.content.startsWith(EXEMPLAR_TAG);
}

/** Split a stored exemplar back into its task + winning output. Pure. */
export function parseExemplar(content: string): { task: string; win: string } {
  const body = content.startsWith(EXEMPLAR_TAG) ? content.slice(EXEMPLAR_TAG.length).trim() : content;
  const winAt = body.indexOf(`\n${WIN_LABEL}`);
  if (winAt < 0) return { task: body.replace(TASK_LABEL, "").trim(), win: "" };
  const task = body.slice(0, winAt).replace(TASK_LABEL, "").trim();
  const win = body.slice(winAt + 1 + WIN_LABEL.length).trim();
  return { task, win };
}

export type StoreExemplarResult = { ok: true; entry: BrainEntry } | { ok: false; error: string };

/**
 * Store a tournament/loop WINNER as a crystallized exemplar. Re-storing the same
 * task+win strengthens it (brain upsert). Errors are returned, never thrown.
 */
export async function storeExemplar(
  taskDesc: string,
  winningOutput: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StoreExemplarResult> {
  const task = taskDesc.trim();
  const win = winningOutput.trim();
  if (!task || !win) return { ok: false, error: "storeExemplar needs a non-empty task and winning output" };
  try {
    const entry = await remember({
      region: EXEMPLAR_REGION,
      content: composeContent(task, win),
      entryType: "skill",
      sourceType: "crystallized",
      crystalStatus: "crystallized",
      salience: 0.8,
      env,
    });
    return { ok: true, entry };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** One recalled exemplar with its similarity-driven activation. */
export type RecalledExemplar = { task: string; win: string; entry: BrainEntry };

/**
 * Retrieve the top-K exemplars most similar to a task, formatted as few-shot
 * context. Reinforces the exemplars it uses (recall strengthens direct hits), so
 * winners that keep getting reused crystallize harder. Empty on no match / error.
 */
export async function recallExemplars(
  taskDesc: string,
  k: number = DEFAULT_RECALL_K,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RecalledExemplar[]> {
  const query = taskDesc.trim();
  if (!query || k <= 0) return [];
  try {
    // Over-fetch then filter to exemplars: the region holds ordinary facts too.
    const { entries } = await recall({ query, region: EXEMPLAR_REGION, topK: k * 4, reinforce: true, env });
    return entries
      .filter(isExemplar)
      .slice(0, k)
      .map((entry) => ({ ...parseExemplar(entry.content), entry }));
  } catch {
    return [];
  }
}

/** Render recalled exemplars as a few-shot context block (empty string if none). Pure. */
export function formatExemplars(exemplars: RecalledExemplar[]): string {
  if (!exemplars.length) return "";
  const blocks = exemplars.map((ex, i) => `Example ${i + 1}\n${TASK_LABEL} ${ex.task}\n${WIN_LABEL} ${ex.win}`);
  return `### Best-of exemplars (winners for similar tasks)\n${blocks.join("\n\n")}`;
}

/**
 * Convenience: recall + format in one call — the few-shot string a similar task
 * injects. Empty string when nothing matches.
 */
export async function exemplarContext(
  taskDesc: string,
  k: number = DEFAULT_RECALL_K,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  return formatExemplars(await recallExemplars(taskDesc, k, env));
}
