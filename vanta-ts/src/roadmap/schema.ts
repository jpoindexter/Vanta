import { z } from "zod";

// "parked" = lives in roadmap.json for the audit trail but is deliberately out of
// the build sequence (build-order + the kanban board exclude it, like "shipped").
export const STATUS = ["shipped", "building", "next", "horizon", "parked"] as const;
export type Status = (typeof STATUS)[number];

// Pickle-jar build-priority — distinct from `size` (effort estimate):
// rock = foundational / unblocks another item / kills the finish-poor bounce → place first
// pebble = substantial standalone feature, built after the rocks
// sand = small, low-risk, fills any gap (quick wins, polish)
export const TIER = ["rock", "pebble", "sand"] as const;
export type Tier = (typeof TIER)[number];

// Advisory build-routing — which Claude tier + reasoning effort a build session should
// use, so we don't spam Opus on sand. NOT auto-routing: the factory triage reads the
// markdown roadmaps, not this file. These are a guide + a durable decision record.
export const MODEL = ["haiku", "sonnet", "opus"] as const;
export type Model = (typeof MODEL)[number];
export const EFFORT = ["low", "medium", "high"] as const;
export type Effort = (typeof EFFORT)[number];

// Advisory Codex build-routing tag. This is the model Vanta would hand to Codex
// for the item, separate from the older Claude-tier `model` field.
export const CODEX = ["gpt-5.4-mini", "gpt-5.4", "gpt-5.5"] as const;
export type Codex = (typeof CODEX)[number];

// Strategic lens — what this item serves for Vanta as a do-everything
// operator, independent of track. Lets the board separate
// the autonomous-agent spine from coding-harness leftovers and pure polish.
//   agent-loop = autonomous reliability (compaction, hooks, permissions, goals, recovery)
//   tui        = display, render stability, visual hierarchy
//   memory     = memory, continuity, brain, context
//   reach      = comms, platforms, senses, autonomy, the wider digital life
//   selfhood   = identity, executive function, values, self-improvement
//   coding     = code-harness-specific (worktrees, bash AST, IDE, code review) — deprioritized
//   infra      = setup, providers, telemetry, enterprise, plumbing
//   cosmetic   = polish, animations, nice-to-have rendering
export const LENS = [
  "agent-loop",
  "tui",
  "memory",
  "reach",
  "selfhood",
  "coding",
  "infra",
  "cosmetic",
] as const;
export type Lens = (typeof LENS)[number];

export const RoadmapItemSchema = z.object({
  id: z.string().min(1),
  track: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(STATUS),
  size: z.string().min(1),
  summary: z.string(),
  done: z.string(),
  tier: z.enum(TIER).optional(),
  model: z.enum(MODEL).optional(),
  effort: z.enum(EFFORT).optional(),
  codex: z.enum(CODEX).optional(),
  lens: z.enum(LENS).optional(),
  // Metadata written by ship/triage tooling. Declared so RoadmapSchema.parse →
  // write round-trips (moveRoadmapItem) don't silently strip them (zod drops
  // unknown keys by default).
  updated: z.string().optional(),
  notes: z.string().optional(),
  // Provenance tag for batch-ingested cards (e.g. a reference-codebase audit),
  // so a cohort stays filterable. Declared so parse→write round-trips keep it.
  source: z.string().optional(),
  // Build-order dependency: this card never sorts before an open card it names.
  after: z.array(z.string()).optional(),
});

export const RoadmapSchema = z.object({
  updated: z.string(),
  items: z.array(RoadmapItemSchema).min(1),
});

export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;
export type Roadmap = z.infer<typeof RoadmapSchema>;
