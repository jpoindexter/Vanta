import { join } from "node:path";
import type { Goal } from "./types.js";
import type { NdPreferences, OutputDensity } from "./nd/types.js";
import type { ToolSchema } from "./providers/interface.js";
import { readStack } from "./task-stack/store.js";
import { taskStackSummary } from "./task-stack/summary.js";
import { platformHint } from "./gateway/platforms/hints.js";
import { formatPromptPreset, type PromptPreset } from "./prompt/presets.js";
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
  /** User-controlled executive-function communication contract. Omitted in safe mode. */
  ndPreferences?: NdPreferences;
  /**
   * MSG-PLATFORM-HINTS: active messaging-platform id (telegram/irc/…). When set
   * to a known id, a one-line formatting hint is folded into the context tier so
   * the agent adapts markdown to the surface. Defaults to `VANTA_GATEWAY_PLATFORM`
   * (the env the gateway sets); unset/unknown = no line (default prompt unchanged).
   */
  gatewayPlatform?: string;
  /** Operator-selected role overlay. Base safety/kernel instructions remain intact. */
  promptPreset?: PromptPreset;
  /** Best-effort evidence sink for project-context loads and imports. */
  contextObserver?: (event: { kind: "loaded" | "missing" | "cycle"; path: string; source: string }) => void | Promise<void>;
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
  { id: "executive-function", render: ({ opts }) => executiveFunctionTier(opts.ndPreferences) },
  { id: "prompt-preset", render: ({ opts }) => (opts.promptPreset ? formatPromptPreset(opts.promptPreset) : "") },
  {
    id: "self",
    render: ({ opts }) =>
      opts.selfContent?.trim() ? `Self layer (identity + values + honesty guardrail):\n${opts.selfContent}` : "",
  },
  { id: "brain", render: ({ opts }) => brainTier(opts.brain) },
  { id: "skills", render: ({ opts }) => skillsTier(opts.skills) },
  { id: "context", render: ({ opts }) => (opts.loadContext === false ? "" : contextTier(opts.root, opts.contextObserver)) },
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

/** Compose existing ND supports into one profile-driven operating contract. */
export function executiveFunctionTier(prefs?: NdPreferences): string {
  if (!prefs) return "";

  const density = {
    minimal: "Keep responses compressed: one action or decision at a time unless the task needs more.",
    balanced: "Keep responses concise and structured; expand only when the task needs it.",
    rich: "Include useful context and reasoning, but keep the active action easy to find.",
  }[prefs.outputDensity];
  const sensory = {
    low: "Use plain labels and minimal visual decoration; avoid emoji and noisy status ornament.",
    medium: "Use restrained structure and decoration only when it improves scanning.",
    high: "Richer visual structure is acceptable, but never let decoration obscure the next action.",
  }[prefs.sensoryLoad];
  const time = {
    ranges: "When estimating, use best / realistic / worst ranges with named hidden costs and explicit checkpoints.",
    points: "Use a single practical estimate when asked, and surface an explicit checkpoint for longer work.",
    off: "Do not add time estimates or elapsed-time nudges unless the user asks.",
  }[prefs.timeSupport];

  return [
    "Executive-function operating contract (profile-driven support, never diagnosis):",
    "- Orient from the active goal, operator task stack, and recent evidence; do not make the user reconstruct context Vanta already has.",
    "- Start with the smallest concrete reversible action when intent is clear; otherwise ask only the question that unlocks motion.",
    "- For multi-step work, expose Now / Next / Later and offer at most three ranked choices instead of an unranked backlog.",
    "- Preserve unfinished work across topic shifts, name the boundary once, and never nag or shame a pause.",
    "- Checkpoint after meaningful progress; close only with actual verification and one explicit next action or a closed loop.",
    "- Reduce scope before adding explanation when the user appears overloaded.",
    "- Do not turn a simple request into a coaching ritual; just do the work when the path is clear.",
    `Active support profile: output=${prefs.outputDensity} · sensory=${prefs.sensoryLoad} · time=${prefs.timeSupport}.`,
    `- ${density}`,
    `- ${sensory}`,
    `- ${time}`,
  ].join("\n");
}

/** Build the system prompt by rendering the ordered PROMPT_TIERS registry. */
export async function buildSystemPrompt(opts: BuildPromptOptions): Promise<string> {
  const soul =
    (await readIfExists(opts.soulPath)) ??
    "# Vanta\n" +
      "I am Vanta — a trusted personal operator and neurodivergent-first executive-function support. " +
      "I turn messy intent into safe, visible progress: orient, start with the smallest useful action, " +
      "execute under the safety kernel, checkpoint, verify the actual claim, and close the loop. " +
      "I work across the user's digital life — code, research, comms, calendar, and the web — while " +
      "staying direct, warm, concise, honest about uncertainty, and never fabricating progress.";
  const stack = await readStack(join(opts.root, ".vanta")).catch(() => ({ tasks: [] }));
  const tasksTier = taskStackSummary(stack) ? `Operator task stack:\n${taskStackSummary(stack)}` : "";
  const ctx: PromptTierContext = { opts, soul, tasksTier };
  return assembleTiers(PROMPT_TIERS, ctx);
}

/**
 * Assemble an ordered tier list into the final prompt: render each tier, drop the
 * empties, join with TIER_SEP. This is the ENTIRE assembler — adding, replacing, or
 * reordering a tier is a change to the tier LIST (e.g. {@link PROMPT_TIERS}), never to
 * this logic (PORT-PROMPT-TIERS). Exported so an alternate list can be assembled +
 * tested through the same code path a real tier set uses.
 */
export async function assembleTiers(tiers: PromptTier[], ctx: PromptTierContext): Promise<string> {
  const rendered = await Promise.all(tiers.map((t) => t.render(ctx)));
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
