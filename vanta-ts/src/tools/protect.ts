import { z } from "zod";
import type { Tool } from "./types.js";
import { scanForThreats, formatThreatReport } from "../protection/agent.js";

// PROTECTION-AGENT tool: scan content for scams, privacy risks, unsafe commands,
// manipulation, agent overreach, and contract traps.

const Args = z.object({
  text: z.string().min(1).describe("Text to scan for threats"),
});

export const protectTool: Tool = {
  schema: {
    name: "protect",
    description:
      "Scan text for threats: scams, credential exposure, destructive commands, " +
      "social engineering, agent-overreach instructions, and contract traps. " +
      "Use on suspicious messages, contract clauses, or any input that might be risky.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to scan" },
      },
      required: ["text"],
    },
  },
  describeForSafety: () => "scan text for threats",
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "protect needs a text string" };
    const threats = scanForThreats(parsed.data.text);
    return { ok: true, output: formatThreatReport(threats) };
  },
};
