import { z } from "zod";
import type { Tool } from "./types.js";
import { writeSkill } from "../skills/store.js";

const Args = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

export const writeSkillTool: Tool = {
  schema: {
    name: "write_skill",
    description:
      "Record a reusable skill learned from experience so it can be recalled and applied later.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Short kebab-friendly name for the skill",
        },
        description: {
          type: "string",
          description: "One-line summary of what the skill does",
        },
        body: {
          type: "string",
          description: "The markdown how-to that captures the skill",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional tags for retrieval",
        },
      },
      required: ["name", "description", "body"],
    },
  },
  // Constant string by design: a skill write is an internal memory op touching
  // no user files. Echoing name/description/body/tags here would let their
  // content (e.g. the word "delete") false-trigger the kernel safety classifier.
  describeForSafety: () => "record a learned skill in argo's memory",
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        output: "write_skill needs name, description, and body strings",
      };
    }
    try {
      const { name, description, body, tags } = parsed.data;
      const result = await writeSkill({ name, description, body, tags });
      return {
        ok: true,
        output: `saved skill "${result.skill.meta.name}" (${result.path})`,
      };
    } catch (err) {
      return { ok: false, output: (err as Error).message };
    }
  },
};
