import type { MemoryRecord, MemQuestion, NoiseLevel } from "./types.js";

// The fixture multi-session corpus. GOLD = memories referenced by a question;
// DISTRACTORS = the noise pool the sweep grows. Texts use a synthetic operator
// and deliberately share vocabulary with the questions so distractors
// genuinely compete in ranking — that is what makes recall@k discriminate.

const GOLD: MemoryRecord[] = [
  // knowledge-update: the editor and the default provider both changed across sessions
  { id: "g-editor-old", session: 1, at: "2024-01-10", text: "Alex's primary code editor is VS Code." },
  { id: "g-editor-new", session: 8, at: "2024-06-02", text: "Alex switched their primary code editor to Zed for speed." },
  { id: "g-prov-old", session: 2, at: "2024-02-01", text: "Vanta's default LLM provider was set to OpenAI." },
  { id: "g-prov-new", session: 9, at: "2024-06-10", text: "Vanta's default LLM provider is now local Ollama for routine work." },
  // multi-session aggregation: active projects, stack requirements
  { id: "g-proj-indx", session: 3, at: "2024-02-15", text: "Alex is actively building Atlas, an AI second-brain app." },
  { id: "g-proj-vanta", session: 4, at: "2024-03-01", text: "Alex is actively building Harbor, a local operator agent." },
  { id: "g-proj-brutal", session: 5, at: "2024-03-20", text: "Alex is actively building Studio, an AI design app." },
  { id: "g-stack-esm", session: 1, at: "2024-01-12", text: "Alex's stack is Node 22 with ESM and TypeScript strict mode." },
  { id: "g-stack-zod", session: 6, at: "2024-04-02", text: "Alex requires Zod validation at every external boundary." },
  // preference recall
  { id: "g-pref-options", session: 7, at: "2024-05-01", text: "Alex prefers choices as a plain-text numbered list with a recommendation, not a picker widget." },
  { id: "g-pref-push", session: 7, at: "2024-05-01", text: "Alex wants every commit pushed to origin immediately, with no batching." },
  // temporal reasoning
  { id: "g-temp-valencia", session: 2, at: "2024-01-20", text: "Alex relocated to Valencia on 2023-09-01." },
  { id: "g-temp-rewrite", session: 10, at: "2024-06-15", text: "The Vanta public-prep git history rewrite happened on 2026-06-17." },
  { id: "g-temp-dur", session: 5, at: "2024-03-21", text: "Alex has been a software developer for 15 years." },
  { id: "g-temp-firstcommit", session: 1, at: "2024-01-09", text: "Alex's first open-source commit was on 2010-03-12." },
  { id: "g-temp-indx-start", session: 3, at: "2024-02-14", text: "Alex began building Atlas on 2023-06-15." },
];

const DISTRACTORS: MemoryRecord[] = [
  { id: "d01", session: 1, at: "2024-01-05", text: "Alex uses a laptop with 32GB of RAM." },
  { id: "d02", session: 1, at: "2024-01-06", text: "Vanta's kernel is written in Rust with zero dependencies." },
  { id: "d03", session: 2, at: "2024-02-03", text: "The Vanta kernel enforces safety via an assess() gate on every action." },
  { id: "d04", session: 2, at: "2024-02-04", text: "The operator explicitly prefers concrete patterns and low-density structure when cognitive load is high." },
  { id: "d05", session: 3, at: "2024-02-16", text: "indx uses Tauri 2, Hono, SQLite, and React." },
  { id: "d06", session: 3, at: "2024-02-18", text: "brutal is a taste-focused Studio web app." },
  { id: "d07", session: 4, at: "2024-03-02", text: "Vanta's roadmap lives in roadmap.json with per-card statuses." },
  { id: "d08", session: 4, at: "2024-03-05", text: "Alex keeps active repositories under ~/Projects/active." },
  { id: "d09", session: 5, at: "2024-03-22", text: "The Vanta TUI was rebuilt on real Ink 7 in June 2026." },
  { id: "d10", session: 5, at: "2024-03-25", text: "Vanta has 84 built-in tools and 97 slash commands." },
  { id: "d11", session: 6, at: "2024-04-03", text: "Alex dislikes filler language and preamble in responses." },
  { id: "d12", session: 6, at: "2024-04-05", text: "The brain stores markdown regions plus structured entries." },
  { id: "d13", session: 6, at: "2024-04-08", text: "Vanta's docs site runs on Cloudflare Pages at docs.vanta.theft.studio." },
  { id: "d14", session: 7, at: "2024-05-02", text: "Alex's test email address is alex@example.test." },
  { id: "d15", session: 7, at: "2024-05-03", text: "The kernel listens on 127.0.0.1:7788 for the cockpit and JSON API." },
  { id: "d16", session: 8, at: "2024-06-03", text: "Vanta gates every tool call through the kernel — rule zero." },
  { id: "d17", session: 8, at: "2024-06-04", text: "Alex wants function-first shipping; polish comes after a real user." },
  { id: "d18", session: 8, at: "2024-06-05", text: "The world model stores typed entities and relations." },
  { id: "d19", session: 9, at: "2024-06-11", text: "Life-search defaults to lexical ranking with opt-in Ollama embeddings." },
  { id: "d20", session: 9, at: "2024-06-12", text: "Vanta supports OpenAI, Gemini, Anthropic, OpenRouter, and Ollama backends." },
  { id: "d21", session: 9, at: "2024-06-13", text: "Alex caps source files at 300 lines and functions at 50." },
  { id: "d22", session: 10, at: "2024-06-16", text: "The Ralph loop persists progress in .vanta/ralph-loop.json." },
  { id: "d23", session: 10, at: "2024-06-17", text: "Vanta's session memory is distilled into .vanta/session-memory.md." },
  { id: "d24", session: 10, at: "2024-06-18", text: "Alex archived two prototype repositories as dormant experiments." },
];

export const QUESTIONS: MemQuestion[] = [
  { id: "ku1", query: "which code editor does Alex use now", category: "knowledge-update", gold: ["g-editor-new"] },
  { id: "ku2", query: "what is Vanta's current default model provider", category: "knowledge-update", gold: ["g-prov-new"] },
  { id: "ms1", query: "which projects is Alex actively working on", category: "multi-session", gold: ["g-proj-indx", "g-proj-vanta", "g-proj-brutal"] },
  { id: "ms2", query: "what are Alex's core stack requirements", category: "multi-session", gold: ["g-stack-esm", "g-stack-zod"] },
  { id: "pr1", query: "how does Alex like choices presented to them", category: "preference", gold: ["g-pref-options"] },
  { id: "pr2", query: "what is Alex's git push preference", category: "preference", gold: ["g-pref-push"] },
  { id: "tm1", query: "when did Alex move to Valencia", category: "temporal", gold: ["g-temp-valencia"] },
  { id: "tm2", query: "on what date did the Vanta history rewrite happen", category: "temporal", gold: ["g-temp-rewrite"] },
  { id: "tm3", query: "how long has Alex been a developer", category: "temporal", gold: ["g-temp-dur"] },
  // Temporally hard: the query references time abstractly, sharing no keywords with
  // the answering memory — plain lexical recall is weakest here (Chronos category).
  { id: "tq-earliest", query: "what is the earliest dated event recorded about Alex", category: "temporal", gold: ["g-temp-firstcommit"] },
  { id: "tq-latest", query: "what is the most recent dated event on record", category: "temporal", gold: ["g-temp-rewrite"] },
  { id: "tq-duration", query: "what duration of experience is on record", category: "temporal", gold: ["g-temp-dur"] },
];

/** Distractor count per noise level ("full" = the whole pool). */
export function noiseCount(noise: NoiseLevel): number {
  switch (noise) {
    case "s5": return 5;
    case "s10": return 10;
    case "s20": return 20;
    case "full": return DISTRACTORS.length;
  }
}

/** Build the corpus for a noise level: all gold + the first N distractors (deterministic). */
export function buildCorpus(noise: NoiseLevel): MemoryRecord[] {
  return [...GOLD, ...DISTRACTORS.slice(0, noiseCount(noise))];
}

export const NOISE_LEVELS: NoiseLevel[] = ["s5", "s10", "s20", "full"];
