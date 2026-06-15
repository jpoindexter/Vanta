import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { BRAIN_REGIONS, isBrainRegion } from "../brain/regions.js";
import { readRegion, writeRegion, remember, recall } from "../brain/brain.js";
import { guardMemoryRecall } from "../memory/guardrails.js";

// The `brain` tool: Vanta reads and grows its own brain (~/.vanta/brain/). A digest
// is already in the system prompt; use this to work a region in full (read/append/
// replace), or the structured layer: remember (a typed, strength-scored memory that
// decays unless reinforced) and recall (top memories by strength×recency — retrieval
// itself reinforces them).

const Args = z.object({
  action: z.enum(["read", "append", "replace", "list", "remember", "recall"]),
  region: z.string().optional(),
  content: z.string().optional(),
  query: z.string().optional(),
  entry_type: z.enum(["fact", "skill", "preference", "pattern", "insight", "plan", "emotion"]).optional(),
  strength: z.number().min(0).max(1).optional(),
  forget_after: z.string().optional(),
  top_k: z.number().int().positive().max(50).optional(),
});
type ParsedArgs = z.infer<typeof Args>;

const REGION_LIST = BRAIN_REGIONS.map((r) => `${r.name} — ${r.description}`).join("\n");

async function handleRegionAction(a: ParsedArgs): Promise<ToolResult> {
  const { action, region, content } = a;
  if (!region || !isBrainRegion(region)) {
    return { ok: false, output: `unknown region "${region ?? ""}". Use action=list to see valid regions.` };
  }
  if (action === "read") {
    const body = await readRegion(region);
    return { ok: true, output: body?.trim() || `(${region} is empty)` };
  }
  if (!content?.trim()) return { ok: false, output: `${action} needs content` };
  await writeRegion(region, content, { append: action === "append" });
  return { ok: true, output: `brain.${region} ${action === "append" ? "updated (appended)" : "rewritten"}` };
}

async function handleRemember(a: ParsedArgs): Promise<ToolResult> {
  if (!a.region || !isBrainRegion(a.region)) {
    return { ok: false, output: `remember needs a valid region. Use action=list to see them.` };
  }
  if (!a.content?.trim()) return { ok: false, output: "remember needs content" };
  const e = await remember({
    region: a.region,
    content: a.content,
    entryType: a.entry_type,
    strength: a.strength,
    forgetAfter: a.forget_after,
  });
  return { ok: true, output: `remembered [${e.region}|${e.entryType}|str:${e.strength.toFixed(2)}] ${e.id}` };
}

async function handleRecall(a: ParsedArgs): Promise<ToolResult> {
  const r = await recall({ query: a.query, region: a.region, topK: a.top_k ?? 10 });
  if (!r.entries.length) return { ok: true, output: "(no matching memories)" };
  return { ok: true, output: guardMemoryRecall(r.entries).formatted };
}

export const brainTool: Tool = {
  schema: {
    name: "brain",
    description:
      "Read and grow your own brain (durable, git-versioned). Regions:\n" +
      REGION_LIST +
      "\nUse action=list to see regions, read to load one in full, append to add what you've " +
      "learned (preferred — non-destructive), replace to rewrite a region. Update user_model/" +
      "semantic/episodic as you learn about the user and world; reflections after mistakes; " +
      "identity/personality as it forms. For discrete memories use remember (typed entry with " +
      "strength + optional forget_after decay) and recall (top memories by strength×recency; " +
      "recalling reinforces them).",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["read", "append", "replace", "list", "remember", "recall"], description: "What to do" },
        region: { type: "string", description: "Brain region (see list). Required except for list/recall." },
        content: { type: "string", description: "Text for append/replace/remember." },
        query: { type: "string", description: "recall: substring filter over memories." },
        entry_type: { type: "string", enum: ["fact", "skill", "preference", "pattern", "insight", "plan", "emotion"], description: "remember: kind of memory (default fact)." },
        strength: { type: "number", description: "remember: initial consolidation 0–1 (default 0.5)." },
        forget_after: { type: "string", description: "remember: ISO date after which the memory decays." },
        top_k: { type: "number", description: "recall: how many memories (default 10, max 50)." },
      },
      required: ["action"],
    },
  },
  // Never echo content — it can false-trigger the safety classifier.
  describeForSafety: (a) => `brain ${String(a.action ?? "")} ${String(a.region ?? "")}`.trim(),
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: "brain needs an action: list | read | append | replace | remember | recall" };
    }
    const a = parsed.data;
    if (a.action === "list") return { ok: true, output: `Brain regions:\n${REGION_LIST}` };
    if (a.action === "remember") return handleRemember(a);
    if (a.action === "recall") return handleRecall(a);
    return handleRegionAction(a);
  },
};
