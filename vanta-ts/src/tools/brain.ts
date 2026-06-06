import { z } from "zod";
import type { Tool } from "./types.js";
import { BRAIN_REGIONS, isBrainRegion } from "../brain/regions.js";
import { readRegion, writeRegion } from "../brain/store.js";

// The `brain` tool: Vanta reads and grows its own brain (~/.vanta/brain/). A digest
// of every region is already in the system prompt; use this to read a region in
// full, or to write/append what it learns about itself, the user, or the world.

const Args = z.object({
  action: z.enum(["read", "append", "replace", "list"]),
  region: z.string().optional(),
  content: z.string().optional(),
});

const REGION_LIST = BRAIN_REGIONS.map((r) => `${r.name} — ${r.description}`).join("\n");

export const brainTool: Tool = {
  schema: {
    name: "brain",
    description:
      "Read and grow your own brain (durable, git-versioned). Regions:\n" +
      REGION_LIST +
      "\nUse action=list to see regions, read to load one in full, append to add what you've " +
      "learned (preferred — non-destructive), replace to rewrite a region. Update user_model/" +
      "semantic/episodic as you learn about the user and world; reflections after mistakes; " +
      "identity/personality as it forms.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["read", "append", "replace", "list"], description: "What to do" },
        region: { type: "string", description: "Brain region (see list). Required except for action=list." },
        content: { type: "string", description: "Text to append/replace (required for append/replace)." },
      },
      required: ["action"],
    },
  },
  // Never echo content — it can false-trigger the safety classifier.
  describeForSafety: (a) => `brain ${String(a.action ?? "")} ${String(a.region ?? "")}`.trim(),
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "brain needs an action: list | read | append | replace" };
    const { action, region, content } = parsed.data;

    if (action === "list") {
      return { ok: true, output: `Brain regions:\n${REGION_LIST}` };
    }
    if (!region || !isBrainRegion(region)) {
      return { ok: false, output: `unknown region "${region ?? ""}". Use action=list to see valid regions.` };
    }
    if (action === "read") {
      const body = await readRegion(region);
      return { ok: true, output: body?.trim() || `(${region} is empty)` };
    }
    // append / replace
    if (!content?.trim()) return { ok: false, output: `${action} needs content` };
    await writeRegion(region, content, { append: action === "append" });
    return { ok: true, output: `brain.${region} ${action === "append" ? "updated (appended)" : "rewritten"}` };
  },
};
