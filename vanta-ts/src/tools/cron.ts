import { join } from "node:path";
import { z } from "zod";
import type { Tool } from "./types.js";
import { addCron, loadCron } from "../schedule/cron.js";
import { addDurableCron } from "../schedule/durable-cron.js";

const CreateArgs = z.object({
  cron: z.string().min(1),
  instruction: z.string().min(1),
  durable: z.boolean().optional(),
  recurring: z.boolean().optional(),
});

function dataDir(root: string): string {
  return join(root, ".vanta");
}

export const cronCreateTool: Tool = {
  schema: {
    name: "cron_create",
    description: "Create a scheduled task. durable=true persists to .vanta/scheduled_tasks.json.",
    parameters: {
      type: "object",
      properties: {
        cron: { type: "string", description: "5-field cron expression" },
        instruction: { type: "string", description: "Instruction to run when due" },
        durable: { type: "boolean", description: "Persist across restarts (default false)" },
        recurring: { type: "boolean", description: "Repeat after running (default true)" },
      },
      required: ["cron", "instruction"],
    },
  },
  describeForSafety: (args) => `create cron ${String(args.cron ?? "")}`,
  async execute(raw, ctx) {
    const parsed = CreateArgs.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "cron_create needs cron and instruction" };
    const { cron, instruction, durable = false, recurring = true } = parsed.data;
    const entry = durable
      ? await addDurableCron(dataDir(ctx.root), cron, instruction, recurring)
      : await addCron(dataDir(ctx.root), cron, instruction);
    const flags = durable ? `durable, ${recurring ? "recurring" : "one-shot"}` : "in-memory";
    return { ok: true, output: `scheduled #${entry.id} (${flags}) ${entry.cron} — ${entry.instruction}` };
  },
};

export const cronListTool: Tool = {
  schema: {
    name: "cron_list",
    description: "List scheduled tasks from cron.tsv and scheduled_tasks.json.",
    parameters: { type: "object", properties: {} },
  },
  describeForSafety: () => "list cron tasks",
  async execute(_raw, ctx) {
    const entries = await loadCron(dataDir(ctx.root));
    if (!entries.length) return { ok: true, output: "(no scheduled tasks)" };
    const lines = entries.map((e) => {
      const durable = "durable" in e && e.durable === true ? " durable" : "";
      const recurring = "recurring" in e && e.recurring === false ? " one-shot" : "";
      return `#${e.id} [${e.status}${durable}${recurring}] ${e.cron} — ${e.instruction}`;
    });
    return { ok: true, output: lines.join("\n") };
  },
};
