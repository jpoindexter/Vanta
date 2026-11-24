import { z } from "zod";
import { appendIntegrationReceipt } from "../integrations/receipts.js";
import { createTrelloCard, updateTrelloCard } from "../integrations/trello.js";
import type { Tool } from "./types.js";

const Args = z.union([
  z.object({ action: z.literal("create_card"), listId: z.string().min(1), name: z.string().min(1).max(500), desc: z.string().max(16_000).optional() }),
  z.object({ action: z.literal("update_card"), cardId: z.string().min(1), expectedDateLastActivity: z.string().min(1), name: z.string().min(1).max(500).optional(), desc: z.string().max(16_000).optional() }).refine((value) => value.name !== undefined || value.desc !== undefined, "name or desc is required"),
]);

export const trelloWriteTool: Tool = {
  schema: {
    name: "trello_write",
    description: "Create or update a Trello card. Always asks for approval before writing.",
    parameters: { type: "object", properties: { action: { type: "string", enum: ["create_card", "update_card"] }, listId: { type: "string" }, cardId: { type: "string" }, expectedDateLastActivity: { type: "string" }, name: { type: "string" }, desc: { type: "string" } }, required: ["action"] },
  },
  describeForSafety: (args) => `write Trello card ${String(args.cardId ?? args.listId ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "trello_write needs a valid card action and required fields." };
    const args = parsed.data;
    const action = args.action === "create_card" ? "create a Trello card" : "update a Trello card";
    if (!await ctx.requestApproval(action, "changes a card in your authorized Trello workspace", "trello_write")) return { ok: false, output: "denied by user" };
    try {
      const card = args.action === "create_card" ? await createTrelloCard(args) : await updateTrelloCard(args);
      await appendIntegrationReceipt(ctx.root, { integration: "trello", action: "write", outcome: "passed", detail: `${args.action} ${card.id}` });
      return { ok: true, output: `${args.action} succeeded: ${card.id}` };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await appendIntegrationReceipt(ctx.root, { integration: "trello", action: "write", outcome: "failed", detail });
      return { ok: false, output: detail };
    }
  },
};
