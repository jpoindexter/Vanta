// AUTO-ROUTER: automatic per-task model routing + ephemeral subagent dispatch.
// Extends model-router.ts (classifyTask) with a richer task taxonomy and a
// subagent dispatch interface that the agent loop can call for parallelizable
// subtasks without wiring a full delegate tool.

import { classifyTask } from "./model-router.js";
import type { LLMProvider } from "../providers/interface.js";
import { resolveProvider } from "../providers/index.js";

/**
 * Granular routing labels — more specific than cheap/expensive.
 * Maps to `TASK_ROUTING` table below.
 */
export type TaskKind =
  | "code"          // write / debug / refactor code
  | "plan"          // architecture, design, strategy
  | "research"      // web search, summarize external sources
  | "classify"      // tagging, categorization, yes/no decisions
  | "summarize"     // compress long text, TL;DR
  | "title"         // generate a short label
  | "vision"        // image analysis (routes to aux vision)
  | "generic";      // anything else → primary model

/** Env var and default model tier for each kind. */
const TASK_ROUTING: Record<TaskKind, { envVar: string; defaultTier: "cheap" | "expensive" }> = {
  code:      { envVar: "VANTA_MODEL_CODE",      defaultTier: "expensive" },
  plan:      { envVar: "VANTA_MODEL_PLAN",      defaultTier: "expensive" },
  research:  { envVar: "VANTA_MODEL_RESEARCH",  defaultTier: "expensive" },
  classify:  { envVar: "VANTA_MODEL_CLASSIFY",  defaultTier: "cheap" },
  summarize: { envVar: "VANTA_MODEL_SUMMARIZE", defaultTier: "cheap" },
  title:     { envVar: "VANTA_MODEL_TITLE",     defaultTier: "cheap" },
  vision:    { envVar: "VANTA_MODEL_VISION",    defaultTier: "expensive" },
  generic:   { envVar: "",                      defaultTier: "expensive" },
};

// Patterns use word boundaries (\b) for short tokens that are substrings of
// common words (e.g. "test" inside "latest", "fix" inside "prefix").
const CODE_RE    = /\b(write|implement|refactor|debug|migrate|migration|code review)\b/;
const PLAN_RE    = /\b(plan|architect|design|strategy|roadmap|spec|outline|blueprint)\b/;
const RESEARCH_RE = /\b(research|search for|look up|fetch|browse|what is|who is|find out)\b/;
const CLASSIFY_RE = /\b(classify|categorize|label|tag|is this|yes or no|true or false)\b/;
const SUMMARIZE_RE = /\b(summarize|tldr|tl;dr|condense|compress|recap|brief me)\b/;
const TITLE_RE   = /\b(title|headline)\b|generate a (short |brief )?(name|label)/;
const VISION_RE  = /\b(image|screenshot|photo|picture)\b|look at (this|the)|describe the (image|screen)/;

function matchesRe(text: string, re: RegExp): boolean {
  return re.test(text.toLowerCase());
}

/**
 * Classify an instruction into a task kind. Pure.
 * More specific than classifyTask() — returns a TaskKind rather than a tier.
 */
export function classifyTaskKind(instruction: string): TaskKind {
  if (matchesRe(instruction, VISION_RE))    return "vision";
  if (matchesRe(instruction, PLAN_RE))      return "plan";
  if (matchesRe(instruction, RESEARCH_RE))  return "research";
  if (matchesRe(instruction, SUMMARIZE_RE)) return "summarize";
  if (matchesRe(instruction, CLASSIFY_RE))  return "classify";
  if (matchesRe(instruction, TITLE_RE))     return "title";
  if (matchesRe(instruction, CODE_RE))      return "code";
  return "generic";
}

/**
 * Resolve the best provider for a given instruction. Combines TaskKind routing
 * (per-function env overrides) with the cheap/expensive tier fallback.
 * Never breaks the default: when no override is configured, resolveProvider(env)
 * runs unchanged.
 */
export function resolveAutoProvider(
  instruction: string,
  env: NodeJS.ProcessEnv,
): LLMProvider {
  const kind = classifyTaskKind(instruction);
  const routing = TASK_ROUTING[kind];
  const override = routing.envVar ? env[routing.envVar] : undefined;

  if (override) return resolveProvider({ ...env, VANTA_MODEL: override });

  // Fall back to cheap/expensive tier routing (VANTA_MODEL_CHEAP / _EXPENSIVE).
  const tier = classifyTask(instruction);
  const tierModel =
    tier === "cheap" ? env.VANTA_MODEL_CHEAP : env.VANTA_MODEL_EXPENSIVE;
  if (tierModel) return resolveProvider({ ...env, VANTA_MODEL: tierModel });

  return resolveProvider(env);
}

/**
 * Describe the active routing config for display (e.g. in /status).
 */
export function describeAutoRouter(env: NodeJS.ProcessEnv): string {
  const lines: string[] = [];
  for (const [kind, routing] of Object.entries(TASK_ROUTING) as [TaskKind, typeof TASK_ROUTING[TaskKind]][]) {
    if (!routing.envVar) continue;
    const model = env[routing.envVar];
    if (model) lines.push(`  ${kind.padEnd(10)} → ${model}`);
  }
  const tier = [
    env.VANTA_MODEL_CHEAP ? `  cheap      → ${env.VANTA_MODEL_CHEAP}` : null,
    env.VANTA_MODEL_EXPENSIVE ? `  expensive  → ${env.VANTA_MODEL_EXPENSIVE}` : null,
  ].filter(Boolean);

  const allLines = [...lines, ...tier];
  return allLines.length
    ? `Auto-router:\n${allLines.join("\n")}`
    : "(no routing overrides configured — all tasks use the primary model)";
}
