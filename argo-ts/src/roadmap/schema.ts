import { z } from "zod";

export const STATUS = ["shipped", "building", "next", "horizon"] as const;
export type Status = (typeof STATUS)[number];

export const RoadmapItemSchema = z.object({
  id: z.string().min(1),
  track: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(STATUS),
  size: z.string().min(1),
  summary: z.string(),
  done: z.string(),
});

export const RoadmapSchema = z.object({
  updated: z.string(),
  items: z.array(RoadmapItemSchema).min(1),
});

export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;
export type Roadmap = z.infer<typeof RoadmapSchema>;
