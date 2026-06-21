// BRAIN-ANSWER-OP — synthesize a provenanced answer from recalled memory.
//
// The brain stores memories; this turns it into Q&A. Given a question, recall
// the relevant entries, then ask the model to synthesize a DIRECT answer that
// CITES which entries it used. The answer is GROUNDED-ONLY: no relevant memory →
// an honest "no memory on that", never a fabricated answer without sources.
//
// This file is the pure + injectable layer: the prompt build and the citation
// parse are pure + deterministic; the real recall and the LLM call are injected
// (the boundary). Mirrors world/conflicts.ts recallWithSources (cited provenance
// shape), clarity-gate.ts (pure builder + named wiring), and agent-snapshot.ts
// (memory text is prior data → control-stripped before it reaches the answer).
//
// WIRING (where the live `brain` tool's `answer` action would call this, NOT
// done this round — mirrors the clarity-gate / agent-snapshot deliver-only round):
//   brain/brain.ts gains an `answer(question, env)` facade fn that calls
//   `answerFromMemory(question, deps)` with the real boundary injected:
//     · recall:   (q) => (await recall({ query: q, env })).entries
//                   .map((e) => ({ id: e.id, text: formatEntry(e) }))  // BrainEntry → MemoryEntryRef
//     · complete: a CHEAP-tier provider from routing/model-router.ts
//                   resolveRoutedProvider(env, question) — synthesis is an
//                   aux-task, so it routes to the cheap model (taskClassFor).
//   tools/all-tools.ts: the existing `brain` tool gains an `answer` action
//   whose `describeForSafety` is a constant internal-op string (no path/query →
//   kernel Allow), returning {answer, citations} or the "no memory" honesty.
//   SECURITY: recalled memory text is prior/authored data — control-stripped in
//   both the synthesized answer and the citations before it is returned/rendered.

import type { LLMProvider } from "../providers/interface.js";

/** A recalled memory entry, reduced to what synthesis + citation need. Pure shape. */
export type MemoryEntryRef = { id: string; text: string };

/** A grounded answer plus the entry ids it is provenanced to. */
export type Answer = { answer: string; citations: string[] };

/** The orchestration result: a grounded answer, or an honest no-source verdict. */
export type AnswerResult =
  | { ok: true; answer: string; citations: string[] }
  | { ok: false; reason: "no-memory" };

const CONTROL_RE = /[\x00-\x1f\x7f]/g;

/** Strip control chars + collapse whitespace — prior memory text is untrusted. Pure. */
function clean(text: string): string {
  return text.replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim();
}

const ANSWER_LABEL = "ANSWER:";
const CITES_LABEL = "CITES:";
const NO_MEMORY = "no memory on that";

/**
 * Build the synthesis prompt: the question, the numbered recalled entries, and
 * the grounding instruction (answer ONLY from these, cite the entry numbers you
 * used, say "no memory" if they don't cover it). Pure + deterministic. Entry
 * text is control-stripped so a crafted memory can't inject instructions.
 */
export function buildAnswerPrompt(question: string, entries: MemoryEntryRef[]): string {
  const q = clean(question);
  const numbered = entries
    .map((e, i) => `[${i + 1}] (id:${clean(e.id)}) ${clean(e.text)}`)
    .join("\n");
  return [
    "You answer a question using ONLY the recalled memory entries below.",
    "Ground every claim in those entries — do not use outside knowledge.",
    "",
    `Question: ${q}`,
    "",
    "Recalled memory entries:",
    numbered,
    "",
    "Rules:",
    `- If the entries do not cover the question, reply exactly: ${ANSWER_LABEL} ${NO_MEMORY}`,
    `- Otherwise answer directly, then on a new line list the entry NUMBERS you used.`,
    "",
    "Respond in this format:",
    `${ANSWER_LABEL} <your answer grounded in the entries>`,
    `${CITES_LABEL} <comma-separated entry numbers you used, e.g. 1, 3>`,
  ].join("\n");
}

/** Pull the answer body from a labeled or bare LLM response. Pure, tolerant. */
function extractAnswerText(response: string): string {
  const lines = response.split(/\r?\n/);
  const answerLine = lines.find((l) => l.trim().toLowerCase().startsWith(ANSWER_LABEL.toLowerCase()));
  const raw = answerLine ? answerLine.trim().slice(ANSWER_LABEL.length) : response;
  return clean(raw);
}

/** Pull the cited entry NUMBERS from the response. Pure, tolerant of formatting. */
function extractCitedNumbers(response: string): number[] {
  const lines = response.split(/\r?\n/);
  const citeLine = lines.find((l) => l.trim().toLowerCase().startsWith(CITES_LABEL.toLowerCase()));
  const source = citeLine ? citeLine.slice(citeLine.toLowerCase().indexOf(CITES_LABEL.toLowerCase()) + CITES_LABEL.length) : "";
  const nums = source.match(/\d+/g) ?? [];
  return [...new Set(nums.map(Number))];
}

/**
 * Parse the LLM response into {answer, citations}. Maps each cited entry NUMBER
 * (1-based, as numbered in the prompt) back to the real entry id, KEEPING only
 * citations that map to an actually-recalled entry — a hallucinated number out
 * of range is dropped. Answer + citations are control-stripped. Pure.
 */
export function parseAnswer(llmResponse: string, entries: MemoryEntryRef[]): Answer {
  const answer = extractAnswerText(llmResponse);
  const seen = new Set<string>();
  const citations: string[] = [];
  for (const n of extractCitedNumbers(llmResponse)) {
    const entry = entries[n - 1]; // 1-based prompt numbering → 0-based array
    if (!entry) continue; // hallucinated / out-of-range citation → dropped
    const id = clean(entry.id);
    if (id && !seen.has(id)) {
      seen.add(id);
      citations.push(id);
    }
  }
  return { answer, citations };
}

/** The boundary: real recall + the synthesis LLM call, injected for testing. */
export type AnswerDeps = {
  recall: (question: string) => Promise<MemoryEntryRef[]>;
  complete: (prompt: string) => Promise<string>;
};

/**
 * Recall relevant memory, then synthesize a grounded, cited answer.
 *   · No entries recalled → {ok:false, "no-memory"} WITHOUT calling the LLM
 *     (no source = no answer; never fabricate).
 *   · Entries recalled → build the prompt, complete, parse, return the answer
 *     with citations validated against the recalled entries.
 *   · A complete() throw → {ok:false, "no-memory"} (never throws across the
 *     boundary — errors-as-values).
 */
export async function answerFromMemory(question: string, deps: AnswerDeps): Promise<AnswerResult> {
  let entries: MemoryEntryRef[];
  try {
    entries = await deps.recall(question);
  } catch {
    return { ok: false, reason: "no-memory" };
  }
  if (!entries.length) return { ok: false, reason: "no-memory" };

  let response: string;
  try {
    response = await deps.complete(buildAnswerPrompt(question, entries));
  } catch {
    return { ok: false, reason: "no-memory" }; // synthesis failed → honest no-answer
  }

  const { answer, citations } = parseAnswer(response, entries);
  if (!answer || answer.toLowerCase().includes(NO_MEMORY)) {
    return { ok: false, reason: "no-memory" }; // model declined → no fabricated answer
  }
  return { ok: true, answer, citations };
}

/** Adapter: a provider's `complete` reduced to the prompt→text shape `deps` wants. */
export function providerComplete(provider: LLMProvider): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    const result = await provider.complete([{ role: "user", content: prompt }], []);
    return result.text ?? "";
  };
}
