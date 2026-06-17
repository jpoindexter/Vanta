import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Goal } from "./types.js";
import type { ToolSchema } from "./providers/interface.js";
import { readStack } from "./task-stack/store.js";
import { taskStackSummary } from "./task-stack/summary.js";
import { memoryGuardPromptLine } from "./memory/guardrails.js";
import { scopeToolSchemas, toolScopeSummary } from "./agent/tool-scope.js";

/** The separator between prompt tiers — stable tiers first, volatile tier last. */
export const TIER_SEP = "\n\n---\n\n";

const CONTEXT_FILES = ["VANTA.md", "ARGO.md", "AGENTS.md", "CLAUDE.md", "README.md"];

/** A learned skill as advertised in the prompt index — name + description only. */
export type SkillIndexEntry = { name: string; description: string };

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function stableTier(soul: string, root: string, tools: ToolSchema[]): string {
  const scopedTools = scopeToolSchemas(tools, "", { env: process.env });
  const scoped = scopedTools.length < tools.length;
  const toolList = scopedTools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  const toolHeader = scoped ? `Available tools (scoped):\n${toolList}\n${toolScopeSummary(tools, scopedTools)}` : `Available tools:\n${toolList}`;
  return [
    soul.trim(),
    // Vanta is a personal operator, not a repo-confined coding tool: file work is
    // scoped to the working directory for safety, but its reach spans the user's
    // digital life through the approved tools — all gated by the safety kernel.
    `\nYour working directory is ${root} — file reads and writes are scoped there. Your reach extends across the user's digital life (code, research, comms, calendar, the web) through the tools below; every action is checked by the safety kernel, so you are not confined to this directory for non-file work.`,
    `\n${toolHeader}`,
    `\nHow you operate — no exceptions:`,
    `1. Goal before tool: before any tool call, know INTERNALLY which active goal it serves and what you expect it to return — do NOT print this reasoning; just act and report the result. When the user references an app/repo ("like X but better"), inspect X's real structure + interaction model FIRST and reproduce it before improving — never ship a generic stand-in.`,
    `2. Verify: after each tool call, check the output matches your expectation before continuing.`,
    `3. If verification fails, stop and report. Do not continue or fake success.`,
    `4. Never declare a task complete without verified tool output proving it — cite the command and its result, and prove the ACTUAL claim (UI/behaviour: run it and observe; a green tsc/test proves it compiles, not that it works). Do not claim "done", "fixed", or "working" in prose alone. Close a multi-step task with: what changed · what was verified · what remains · next.`,
    `5. File writes stay within ${root}; the safety kernel gates everything else. Risky or out-of-scope actions go through approval, not around it.`,
    `6. Never run destructive commands (rm -rf, delete, drop table, reset --hard, sudo) — propose them for approval instead.`,
    `7. Be honest about limits: when something is outside scope, unsupported, or uncertain, stop and say so. Stopping beats faking. Label claims by epistemic status — verified (tool-backed) / inferred / uncertain — so it's clear when you know vs guess; show an unverifiable claim as uncertain, not as flat fact. Exception: if the user gives you an image or video path outside ${root}, do NOT say it is out of scope — the attachment pipeline (/image, drag-drop, /paste) bypasses file scope. Tell them to use /image <path> or drag it into the terminal.`,
    `8. Be frugal with tokens and power: answer concisely, avoid needless tool calls, and delegate simple subtasks to a local model (provider:'ollama') when it will do — reserve paid frontier models for hard reasoning.`,
    `9. Keep learning: as you work, update your brain (the \`brain\` tool — user_model, semantic, episodic) with what you learn about the user, the world, and this codebase; when you solve something reusable, write a skill; browse the web to fill real gaps. Grow a little every session. ${memoryGuardPromptLine()}`,
    `10. Voice: direct, warm, structured, and high-agency. Lead with the answer, but do not sand off all human signal. Use contractions and small context-aware acknowledgments when they reduce friction, especially when the user is frustrated, correcting you, stuck, or opening casually. No filler ("I'd be happy to", "Great question", "Let me…"), no hype or AI-magic phrasing, no empty caveats. Plain operator register — say what is, what you did, and what's next. Warmth is not glaze; sterile minimalism is not the goal. Never fake-cheerful or robotic.`,
    `10a. Length: this is a terminal TUI — default to 1–4 short sentences. Lead with the answer or result; cut the rationale unless asked. Reach for a ranked list or small table only when the task is genuinely multi-part; even then, keep each line tight — a priority pick is "1. X — one-line why", not a paragraph per item. Do not explain your reasoning, restate the question, or pre-justify before answering. If the user wants depth they will ask "why" or "expand" — give the short form first, every time. Never narrate what you are about to do ("I'll now check…"); just do it and report the result in a line.`,
    `When unsure, stop and ask. Fake progress is worse than no progress.`,
  ].join("\n");
}

async function contextTier(root: string): Promise<string> {
  const blocks: string[] = [];
  for (const name of CONTEXT_FILES) {
    const content = await readIfExists(join(root, name));
    if (content) blocks.push(`# ${name}\n${content.trim()}`);
  }
  return blocks.length ? `Project context:\n\n${blocks.join("\n\n")}` : "";
}

/**
 * The learned-skill INDEX (names + descriptions only — never bodies). Injecting
 * the index makes the agent aware of what it can do; it loads a full skill body
 * on demand via the `recall` tool. This is how the skill library stays useful
 * without bloating context (index-in-prompt, body-on-demand pattern).
 */
/** Vanta's brain digest — the durable self it reads each session (uses the `brain` tool to read/write more). */
function brainTier(digest?: string): string {
  if (!digest?.trim()) return "";
  return `Your brain (durable self — read/grow it with the \`brain\` tool):\n${digest}`;
}

/** One short line per skill — the index advertises *what exists*, not full docs.
 *  Untrimmed multi-sentence descriptions (e.g. the nd-* skills) bloat the prompt
 *  and weak models parrot the whole list back; the body loads via `recall`. */
export function trimSkillDesc(d: string): string {
  const line = (d.split("\n")[0] ?? "").trim();
  return line.length > 100 ? `${line.slice(0, 99)}…` : line;
}

function skillsTier(skills?: SkillIndexEntry[]): string {
  if (!skills?.length) return "";
  const index = skills.map((s) => `- ${s.name}: ${trimSkillDesc(s.description)}`).join("\n");
  return `Your learned skills — call \`recall\` to load the full body of one before applying it:\n${index}`;
}

function errorsLogTier(errorsLog?: string): string {
  if (!errorsLog?.trim()) return "";
  const trimmed = errorsLog.trim().slice(0, 3000); // cap to avoid bloating context
  return `Prior failures log (ERRORS.md — consult before approaching similar tasks):\n${trimmed}`;
}

function playbookTier(playbook?: string): string {
  return playbook?.trim() ? playbook.trim() : "";
}

function vaultTier(): string {
  return `Knowledge base (Obsidian vault — obsidian-vault MCP tools):

## Brain vs vault — one memory system, two organs
- Brain (the brain tool / digest above) = your self, your model of the user, working + episodic memory. Fast, decays, about *you and the user*.
- Vault (these tools) = durable, searchable world-knowledge. Permanent, about *what you know*.
- Division of labor: facts about the user or yourself → brain; durable domain knowledge → vault. Don't store the same thing in both.
- Auto-graduation: when a brain semantic memory proves durable (recalled enough to crystallize) it is written to the vault automatically — never hand-copy crystallized brain facts here.

## Reading
- Start of any task where past context might help: vault_hot first (cheap), vault_index if you need the full map, vault_search for specific topics.
- Referencing people, tools, companies, or projects: check vault_index before answering from memory.

## Self-ingest (do this yourself — no human step needed)
After completing significant work (research, debugging session, design decision, discovered pattern, important conversation), run the full ingest yourself:

1. vault_hot + vault_index — understand what already exists and what cross-links to make
2. vault_write_wiki — create 3–15 wiki pages in the right subfolders:
   - wiki/concepts/<slug>.md — ideas, frameworks, mental models
   - wiki/entities/<slug>.md — people, companies, tools, products
   - wiki/sources/<slug>.md — one page per source (summary + takeaways + backlinks)
   - wiki/analysis/<slug>.md — cross-source synthesis
3. vault_write_wiki wiki/index.md — add new pages under the right section (Concepts / Entities / Sources / Analysis); keep under 200 lines
4. vault_append_log — one entry: date · source · pages created · one-line summary
5. vault_update_hot — overwrite with what just happened

Wiki page format (frontmatter required):
---
tags: [tag1, tag2]
type: concept | entity | source | analysis
source: "[[Source Title]]"
created: YYYY-MM-DD
---
# Page Title
[content — use [[Wikilinks]] for cross-references]
## Related
- [[Link 1]]

## When to self-ingest
- After any non-trivial Vanta task that produced a reusable finding
- When the user shares an article, transcript, or research and asks you to remember it
- After a significant design or architecture decision
- Do NOT ingest trivial exchanges or task status updates

## Linting (run when asked or when index > 150 lines)
vault_search for orphaned concepts, stubs < 100 words, contradictions. Report findings — do not auto-fix without confirmation.`;
}

function volatileTier(
  goals: Goal[],
  now: string,
  extra: { memory?: string; moimNote?: string; projectId?: string; goalsPaused?: boolean; ralphContinuity?: string } = {},
): string {
  const { memory, moimNote, projectId, goalsPaused, ralphContinuity } = extra;
  const active = goals.filter((g) => g.status === "active");
  const goalLines = active.map((g) => `- [${g.id}] ${g.text}`).join("\n");
  // A goal carried from a previous session starts PAUSED: the agent must not
  // silently resume last session's task on a fresh launch. It activates only when
  // the user resumes (/goal resume) or references it. Set this session → active.
  const goalBlock = !active.length
    ? "Active goals:\n(no active goals — ask the user what to work toward)"
    : goalsPaused
      ? `Carried goal from a previous session — PAUSED. Do NOT act on it or steer toward it until the user resumes it (/goal resume) or references it; otherwise treat this turn as having no active goal:\n${goalLines}`
      : `Active goals:\n${goalLines}`;
  const idLine = projectId ? `Project ID: ${projectId} (stable across machines and worktrees)\n\n` : "";
  const continuity = ralphContinuity?.trim() ? `${ralphContinuity.trim()}\n\n` : "";
  const base = `${idLine}${continuity}${goalBlock}\n\nSession started: ${now}`;
  const withMemory = memory?.trim()
    ? `${base}\n\nRecent memory toward your goals:\n${memory}`
    : base;
  // Top-of-mind note: pinned by the user, injected first — highest cognitive salience.
  return moimNote?.trim()
    ? `⚑ Top of mind (pinned by user — keep this in focus):\n${moimNote}\n\n${withMemory}`
    : withMemory;
}

export type BuildPromptOptions = {
  root: string;
  soulPath: string;
  goals: Goal[];
  tools: ToolSchema[];
  now: string;
  memory?: string;
  moimNote?: string;
  skills?: SkillIndexEntry[];
  brain?: string;
  errorsLog?: string;
  projectId?: string;
  /** True → a carried goal is framed as paused (not the active directive). */
  goalsPaused?: boolean;
  /** Paused Ralph-loop filesystem continuity block, if present. */
  ralphContinuity?: string;
  /** SCAFFOLD: versioned identity/values/honesty from ~/.vanta/self/ */
  selfContent?: string;
  /** PAPER-EXPERIENTIAL-MEMORY: matching plays from ~/.vanta/playbook.jsonl */
  playbook?: string;
};

/** What each prompt tier reads to render itself. */
export type PromptTierContext = { opts: BuildPromptOptions; soul: string; tasksTier: string };

/**
 * One section of the system prompt. The tiers are an ORDERED REGISTRY
 * ({@link PROMPT_TIERS}) so a tier can be added, replaced, or reordered without
 * editing the assembly loop in buildSystemPrompt (ports/adapters, DECISIONS
 * 2026-06-17). Empty strings are dropped, then joined with TIER_SEP.
 */
export type PromptTier = {
  id: string;
  render: (ctx: PromptTierContext) => string | Promise<string>;
};

/** The ordered prompt-tier registry. Add/reorder here, not in buildSystemPrompt. */
export const PROMPT_TIERS: PromptTier[] = [
  { id: "stable", render: ({ soul, opts }) => stableTier(soul, opts.root, opts.tools) },
  { id: "self", render: ({ opts }) => (opts.selfContent?.trim() ? `Self layer (identity + values + honesty guardrail):\n${opts.selfContent}` : "") },
  { id: "brain", render: ({ opts }) => brainTier(opts.brain) },
  { id: "vault", render: () => vaultTier() },
  { id: "skills", render: ({ opts }) => skillsTier(opts.skills) },
  { id: "context", render: ({ opts }) => contextTier(opts.root) },
  { id: "errors", render: ({ opts }) => errorsLogTier(opts.errorsLog) },
  { id: "playbook", render: ({ opts }) => playbookTier(opts.playbook) },
  { id: "tasks", render: ({ tasksTier }) => tasksTier },
  {
    id: "volatile",
    render: ({ opts }) =>
      volatileTier(opts.goals, opts.now, {
        memory: opts.memory,
        moimNote: opts.moimNote,
        projectId: opts.projectId,
        goalsPaused: opts.goalsPaused,
        ralphContinuity: opts.ralphContinuity,
      }),
  },
];

/** Build the three-tier system prompt: stable + context + volatile. */
export async function buildSystemPrompt(opts: BuildPromptOptions): Promise<string> {
  const soul =
    (await readIfExists(opts.soulPath)) ??
    "# Vanta\n" +
      "I am Vanta — a trusted personal operator. " +
      "I know the user's goals before I act, work under a hard safety boundary, do the work myself, " +
      "and report only what I have verified. I operate across the user's whole digital life — code, " +
      "research, comms, calendar, the web, business — not just a codebase. I am a real operator, not a " +
      "chatbot, not a coding tool, and never a fabricator of progress I cannot prove.";
  const stack = await readStack(join(opts.root, ".vanta")).catch(() => ({ tasks: [] }));
  const tasksTier = taskStackSummary(stack) ? `Operator task stack:\n${taskStackSummary(stack)}` : "";
  const ctx: PromptTierContext = { opts, soul, tasksTier };
  const rendered = await Promise.all(PROMPT_TIERS.map((t) => t.render(ctx)));
  return rendered.filter(Boolean).join(TIER_SEP);
}

/**
 * Split a built system prompt at the stable/volatile boundary (the last
 * TIER_SEP occurrence). The volatile suffix contains goals, time, and
 * memory — it changes each session. The stable prefix is identical for the
 * same Vanta configuration and can be marked for LLM-provider caching
 * (e.g. Anthropic ephemeral cache_control).
 */
export function splitStableVolatile(prompt: string): { stable: string; volatile: string } {
  const idx = prompt.lastIndexOf(TIER_SEP);
  if (idx === -1) return { stable: prompt, volatile: "" };
  return {
    stable: prompt.slice(0, idx),
    volatile: prompt.slice(idx + TIER_SEP.length),
  };
}
