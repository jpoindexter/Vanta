import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Goal } from "./types.js";
import type { OutputDensity } from "./nd/types.js";
import type { ToolSchema } from "./providers/interface.js";
import { readStack } from "./task-stack/store.js";
import { taskStackSummary } from "./task-stack/summary.js";
import { memoryGuardPromptLine } from "./memory/guardrails.js";
import { scopeToolSchemas, toolScopeSummary } from "./agent/tool-scope.js";
import { platformHint } from "./gateway/platforms/hints.js";

/** The separator between prompt tiers — stable tiers first, volatile tier last. */
export const TIER_SEP = "\n\n---\n\n";

const CONTEXT_FILES = ["VANTA.md", "ARGO.md", "AGENTS.md", "CLAUDE.md", "README.md"];

/** The length-cap phrase rule 10a opens with at `balanced` (DEFAULT) density. */
const BALANCED_LENGTH_CAP = "default to 1–4 short sentences";
/** Per-density length-cap phrase. `balanced` is the unchanged current phrase. */
const DENSITY_LENGTH_CAP: Record<OutputDensity, string> = {
  minimal: "default to 1–2 short sentences — the tightest form that answers",
  balanced: BALANCED_LENGTH_CAP,
  rich: "use as many short sentences as the task genuinely needs",
};

/**
 * Scale rule 10a's length cap by the user's output-density preference (PURE).
 * `balanced` (DEFAULT) returns the rule unchanged; `minimal`/`rich` swap only
 * the opening cap phrase, never adding a paragraph. Pure — no I/O.
 */
export function applyOutputDensity(lengthRule: string, density: OutputDensity): string {
  if (density === "balanced") return lengthRule; // DEFAULT — unchanged
  return lengthRule.replace(BALANCED_LENGTH_CAP, DENSITY_LENGTH_CAP[density]);
}

/** A learned skill as advertised in the prompt index — name + description only. */
export type SkillIndexEntry = { name: string; description: string };

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function stableTier(soul: string, root: string, tools: ToolSchema[], density: OutputDensity = "balanced"): string {
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
    `7a. Stay current: your training is wide of today. Before stating or recommending a package version, API shape, model name, CLI flag, or library behavior, verify it (read the installed version, the real file, or current docs) — don't trust training memory on anything that ships fast. An unfamiliar capitalized name or short version-like token (v0, o4, 2.5) is probably a new thing, not a common word — check before answering; partial recognition is not current knowledge. Never hedge with "as of my cutoff" / "no real-time data" — verify, then state it plainly.`,
    `8. Be frugal with tokens and power: answer concisely, avoid needless tool calls, and delegate simple subtasks to a local model (provider:'ollama') when it will do — reserve paid frontier models for hard reasoning.`,
    `9. Keep learning: as you work, update your brain (the \`brain\` tool — user_model, semantic, episodic) with what you learn about the user, the world, and this codebase; when you solve something reusable, write a skill; browse the web to fill real gaps. Grow a little every session. ${memoryGuardPromptLine()}`,
    `10. Voice: direct, warm, structured, and high-agency. Lead with the answer, but do not sand off all human signal. Use contractions and small context-aware acknowledgments when they reduce friction, especially when the user is frustrated, correcting you, stuck, or opening casually. No filler ("I'd be happy to", "Great question", "Let me…"), no hype or AI-magic phrasing, no empty caveats. Plain operator register — say what is, what you did, and what's next. Warmth is not glaze; sterile minimalism is not the goal. Never fake-cheerful or robotic. Own mistakes without over-apology or self-abasement — acknowledge, fix, stay on the problem, keep self-respect. Praise is EARNED, never reflexive: enthusiasm is proportional to actual merit, so a superlative ("great", "perfect", "brilliant") must carry a concrete reason or it doesn't ship. Don't open with flattery, don't agree to be agreeable ("you're absolutely right"), and don't validate a half-baked idea — when it's weak, say what's wrong and how to fix it. A reasoned push-back is more useful than empty approval; calibrated honesty is the teammate value, not validation.`,
    applyOutputDensity(
      `10a. Length: this is a terminal TUI — default to 1–4 short sentences. Lead with the answer or result; cut the rationale unless asked. Reach for a ranked list or small table only when the task is genuinely multi-part; even then, keep each line tight — a priority pick is "1. X — one-line why", not a paragraph per item. Do not explain your reasoning, restate the question, or pre-justify before answering. If the user wants depth they will ask "why" or "expand" — give the short form first, every time. Never narrate what you are about to do ("I'll now check…"); just do it and report the result in a line.`,
      density,
    ),
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

function programTier(program?: string): string {
  return program?.trim() ? `Tunable program instructions:\n${program.trim()}` : "";
}

function volatileTier(
  goals: Goal[],
  now: string,
  extra: {
    memory?: string;
    moimNote?: string;
    projectId?: string;
    goalsPaused?: boolean;
    ralphContinuity?: string;
    platformHint?: string;
  } = {},
): string {
  const { memory, moimNote, projectId, goalsPaused, ralphContinuity, platformHint: hint } = extra;
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
  // MSG-PLATFORM-HINTS: one situational line so the agent adapts formatting to
  // the active messaging surface BEFORE output. Absent → no line (default prompt).
  const platformLine = hint?.trim() ? `${hint.trim()}\n\n` : "";
  const base = `${platformLine}${idLine}${continuity}${goalBlock}\n\nSession started: ${now}`;
  const withMemory = memory?.trim()
    ? `${base}\n\nRecent memory toward your goals:\n${memory}`
    : base;
  // Top-of-mind note: pinned by the user, injected first — highest cognitive salience.
  return moimNote?.trim()
    ? `⚑ Top of mind (pinned by user — keep this in focus):\n${moimNote}\n\n${withMemory}`
    : withMemory;
}

/** What buildSystemPrompt reads to render the prompt. */
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
  /** META-TUNE-INSTRUCTIONS: bounded, approved harness instruction block. */
  program?: string;
  /** VANTA-SETTINGS-GIT: git best-practice block (settings.includeGitInstructions).
   *  Empty/absent → no git tier (default prompt unchanged). */
  gitInstructions?: string;
  /** VANTA-TRUST-DIALOG: false → the project's context files are untrusted and not loaded. Default true. */
  loadContext?: boolean;
  /** ND-PREFS-WIRE: scales rule 10a's length cap. Default `balanced` = unchanged. */
  outputDensity?: OutputDensity;
  /**
   * MSG-PLATFORM-HINTS: active messaging-platform id (telegram/irc/…). When set
   * to a known id, a one-line formatting hint is folded into the context tier so
   * the agent adapts markdown to the surface. Defaults to `VANTA_GATEWAY_PLATFORM`
   * (the env the gateway sets); unset/unknown = no line (default prompt unchanged).
   */
  gatewayPlatform?: string;
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
  { id: "stable", render: ({ soul, opts }) => stableTier(soul, opts.root, opts.tools, opts.outputDensity) },
  {
    id: "self",
    render: ({ opts }) =>
      opts.selfContent?.trim() ? `Self layer (identity + values + honesty guardrail):\n${opts.selfContent}` : "",
  },
  { id: "brain", render: ({ opts }) => brainTier(opts.brain) },
  { id: "skills", render: ({ opts }) => skillsTier(opts.skills) },
  { id: "context", render: ({ opts }) => (opts.loadContext === false ? "" : contextTier(opts.root)) },
  { id: "errors", render: ({ opts }) => errorsLogTier(opts.errorsLog) },
  { id: "program", render: ({ opts }) => programTier(opts.program) },
  { id: "git", render: ({ opts }) => (opts.gitInstructions?.trim() ? opts.gitInstructions.trim() : "") },
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
        // Field first, then the env the gateway sets; unknown id → undefined → no line.
        platformHint: platformHint(opts.gatewayPlatform ?? process.env.VANTA_GATEWAY_PLATFORM),
      }),
  },
];

/** Build the system prompt by rendering the ordered PROMPT_TIERS registry. */
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
