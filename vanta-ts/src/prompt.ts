import { join } from "node:path";
import type { Goal } from "./types.js";
import type { OutputDensity } from "./nd/types.js";
import type { ToolSchema } from "./providers/interface.js";
import { readStack } from "./task-stack/store.js";
import { taskStackSummary } from "./task-stack/summary.js";
import { platformHint } from "./gateway/platforms/hints.js";
import {
  readIfExists,
  stableTier,
  brainTier,
  skillsTier,
  contextTier,
  errorsLogTier,
  programTier,
  playbookTier,
  volatileTier,
  type SkillIndexEntry,
} from "./prompt-tiers.js";

export { applyOutputDensity, trimSkillDesc } from "./prompt-tiers.js";
export type { SkillIndexEntry };

/** The separator between prompt tiers — stable tiers first, volatile tier last. */
export const TIER_SEP = "\n\n---\n\n";

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
