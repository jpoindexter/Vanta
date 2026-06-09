import { z } from "zod";
import { STATUS, TIER, MODEL, EFFORT } from "../roadmap/schema.js";
import type { Tool } from "./types.js";

// ROADMAP-ADD — add a roadmap card without hand-editing JSON. Required: id +
// title; everything else has a sensible default so the agent can file a card in
// one call. Unique-id + schema enforcement live in addRoadmapItem.
const Args = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().default(""),
  done: z.string().default(""),
  track: z.string().min(1).default("Backlog"),
  size: z.string().min(1).default("M"),
  status: z.enum(STATUS).default("next"),
  tier: z.enum(TIER).optional(),
  model: z.enum(MODEL).optional(),
  effort: z.enum(EFFORT).optional(),
});

export const roadmapAddTool: Tool = {
  schema: {
    name: "roadmap_add",
    description:
      "Add a NEW roadmap card to roadmap.json (then regenerates roadmap.html). Enforces a unique id " +
      "and the card schema. Required: id, title. Defaults: status=next, track=Backlog, size=M. " +
      "Use roadmap_move to change an existing card's status instead.",
    parameters: {
      type: "object",
      required: ["id", "title"],
      properties: {
        id: { type: "string", description: "Unique card id, e.g. 'AUTO-HANDOFF' (refused if it already exists)." },
        title: { type: "string", description: "Short card title." },
        summary: { type: "string", description: "What the card is + why (one paragraph)." },
        done: { type: "string", description: "The one-sentence done criterion." },
        track: { type: "string", description: "Track/area label (default 'Backlog')." },
        size: { type: "string", description: "Effort size: S, M, L (default 'M')." },
        status: { type: "string", enum: [...STATUS], description: "Column (default 'next')." },
        tier: { type: "string", enum: [...TIER], description: "Build-priority: rock|pebble|sand (optional)." },
        model: { type: "string", enum: [...MODEL], description: "Advisory build model (optional)." },
        effort: { type: "string", enum: [...EFFORT], description: "low|medium|high (optional)." },
      },
    },
  },
  describeForSafety: (args) => `add roadmap card ${String(args.id ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `Invalid args: ${parsed.error.message}` };
    }
    try {
      const { addRoadmapItem } = await import("../roadmap/add.js");
      const item = await addRoadmapItem(ctx.root, parsed.data);
      return { ok: true, output: `Added ${item.id} (${item.status}): ${item.title}` };
    } catch (err) {
      return { ok: false, output: err instanceof Error ? err.message : String(err) };
    }
  },
};
