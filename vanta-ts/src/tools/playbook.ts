import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { appendPlay, loadPlays, matchingPlays, formatPlay } from "../memory/playbook.js";

// `playbook` tool — cross-session experiential memory. The agent calls this to
// record strategies that worked (post-task) and to recall matching plays from
// prior sessions (pre-task). Accumulates reusable procedures across sessions.

const Args = z.object({
  action: z.enum(["record", "recall", "list"]),
  task: z.string().optional(),
  strategy: z.string().optional(),
  outcome: z.string().optional(),
  tags: z.array(z.string()).optional(),
  query: z.string().optional(),
  limit: z.number().int().positive().max(20).optional(),
});

export const playbookTool: Tool = {
  schema: {
    name: "playbook",
    description:
      "Cross-session experiential playbook. record: capture a reusable strategy after completing a task. recall: surface matching strategies from prior sessions before tackling a task. list: browse recent plays.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["record", "recall", "list"], description: "record | recall | list" },
        task: { type: "string", description: "Task context / situation (for record)" },
        strategy: { type: "string", description: "What approach worked (for record)" },
        outcome: { type: "string", description: "Brief result summary (for record)" },
        tags: { type: "array", items: { type: "string" }, description: "Topic tags (for record)" },
        query: { type: "string", description: "Search query (for recall)" },
        limit: { type: "number", description: "Max results (default: recall=5, list=10)" },
      },
      required: ["action"],
    },
  },
  describeForSafety: () => "playbook — read/write reusable strategies in ~/.vanta/playbook.jsonl",

  execute: async (raw): Promise<ToolResult> => {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: parsed.error.message };
    const a = parsed.data;

    if (a.action === "record") {
      if (!a.task?.trim() || !a.strategy?.trim() || !a.outcome?.trim()) {
        return { ok: false, output: "record requires: task, strategy, outcome" };
      }
      const p = appendPlay({ task: a.task, strategy: a.strategy, outcome: a.outcome, tags: a.tags ?? [] });
      return { ok: true, output: `play recorded (${p.id.slice(0, 8)})` };
    }

    if (a.action === "recall") {
      if (!a.query?.trim()) return { ok: false, output: "recall requires: query" };
      const plays = loadPlays();
      const matches = matchingPlays(a.query, plays, a.limit ?? 5);
      return {
        ok: true,
        output: matches.length ? matches.map(formatPlay).join("\n\n") : "(no matching plays)",
      };
    }

    // list
    const plays = loadPlays().slice(0, a.limit ?? 10);
    return {
      ok: true,
      output: plays.length ? plays.map(formatPlay).join("\n\n") : "(no plays recorded yet — use action=record after completing a task)",
    };
  },
};
