import { z } from "zod";

export const STATUS = ["shipped", "building", "next", "horizon"] as const;
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
});

export const RoadmapSchema = z.object({
  updated: z.string(),
  items: z.array(RoadmapItemSchema).min(1),
});

export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;
export type Roadmap = z.infer<typeof RoadmapSchema>;
