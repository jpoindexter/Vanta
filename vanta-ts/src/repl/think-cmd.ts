import type { SlashHandler, SlashResult } from "./types.js";

// Deep-thinking skills — invokable modes that change HOW Vanta approaches a task.
// Each wraps the user's task with a methodology directive and returns it as a
// `resend` (use-slash.ts re-sends it as a normal turn), so the agent executes the
// task under that methodology. No new model capability needed — the leverage is
// the structured approach injected for that turn.

const ULTRATHINK =
  "Engage maximum reasoning depth for this task. Before any tool call: " +
  "(1) restate the goal and its success criteria; " +
  "(2) lay out a step-by-step plan and the key decisions / tradeoffs; " +
  "(3) consider edge cases, failure modes, and at least one alternative approach; " +
  "(4) only then act, verifying each step against the criteria. " +
  "Think hard and thorough, not fast.\n\nTask: ";

const ULTRACODE =
  "Approach this as a multi-agent coding push: " +
  "(1) decompose the work into independent units; " +
  "(2) delegate/swarm parallel subagents on DISJOINT files; " +
  "(3) adversarially verify each result (tests + a skeptic pass) before accepting it; " +
  "(4) synthesize the verified pieces, run the full suite + typecheck, and report honestly. " +
  "Use the delegate, swarm, and loop tools. Keep every slice green.\n\nTask: ";

const DEEP_RESEARCH =
  "Run a deep, multi-source research pass: " +
  "(1) decompose the question into sub-questions / angles; " +
  "(2) fan out multiple web_search queries across those angles, then web_fetch and read the best sources; " +
  "(3) turn key findings into claim/source/date/expiry receipts; " +
  "(4) adversarially verify key claims — default skeptic, corroborate each with a second source, reject unsupported or stale receipts; " +
  "(5) synthesize a structured, CITED answer from surviving receipts and flag what is uncertain or unverified.\n\nQuestion: ";

/** Build a deep-thinking command: wrap the task with `preamble`, re-run it. */
function thinkCmd(label: string, preamble: string): SlashHandler {
  return (arg): SlashResult => {
    const task = arg.trim();
    if (!task) return { output: `  usage: /${label} <task>` };
    return { output: `  ⊙ ${label} — engaging deep mode…`, resend: preamble + task };
  };
}

const SKEPTIC =
  "Adversarially verify this claim — try to REFUTE it. Default to NOT PROVEN unless you " +
  "can show concrete evidence: run it and observe, read the actual file, cite the passing " +
  "test/command. List what would have to be true, check each, then give a verdict " +
  "(proven / not proven / uncertain) with the evidence that backs it.\n\nClaim: ";

export const ultrathink = thinkCmd("ultrathink", ULTRATHINK);
export const ultracode = thinkCmd("ultracode", ULTRACODE);
export const deepResearch = thinkCmd("deep-research", DEEP_RESEARCH);
export const skeptic = thinkCmd("skeptic", SKEPTIC);
