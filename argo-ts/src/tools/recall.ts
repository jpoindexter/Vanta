import { z } from "zod";
import type { Tool } from "./types.js";
import { listSkills } from "../skills/store.js";
import { searchSkills } from "../skills/recall.js";

const Args = z.object({ query: z.string().min(1) });

const MAX_MATCHES = 5;

export const recallTool: Tool = {
  schema: {
    name: "recall",
    description:
      "Search Argo's learned-skill library for relevant know-how before tackling a task.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What you need help with — matched against skill names and descriptions.",
        },
      },
      required: ["query"],
    },
  },
  // Constant: never echo the raw query — it can contain words that trip safety triggers.
  describeForSafety: () => "search argo's skill library",
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'recall needs a "query" string' };
    }
    try {
      const skills = await listSkills();
      const matches = searchSkills(parsed.data.query, skills).slice(0, MAX_MATCHES);
      if (matches.length === 0) {
        return { ok: true, output: "(no matching skills)" };
      }
      const lines = matches.map(
        (m) => `- ${m.skill.meta.name}: ${m.skill.meta.description}`,
      );
      const output = `Matching skills:\n${lines.join("\n")}`;
      return { ok: true, output };
    } catch (err) {
      return { ok: false, output: `recall failed: ${(err as Error).message}` };
    }
  },
};
