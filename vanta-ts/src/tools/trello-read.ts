import { z } from "zod";
import { listTrelloBoards, listTrelloCards, listTrelloLists, listTrelloWorkspaces, searchTrello } from "../integrations/trello.js";
import type { Tool } from "./types.js";

const Args = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list_workspaces") }),
  z.object({ action: z.literal("list_boards") }),
  z.object({ action: z.literal("list_lists"), boardId: z.string().min(1) }),
  z.object({ action: z.literal("list_cards"), listId: z.string().min(1) }),
  z.object({ action: z.literal("search"), query: z.string().min(1).max(500) }),
]);

function output(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  return text.length > 80_000 ? `${text.slice(0, 80_000)}\n…[truncated]` : text;
}

export const trelloReadTool: Tool = {
  schema: {
    name: "trello_read",
    description: "List or search the authorized Trello workspaces, boards, lists, and cards. Read-only.",
    parameters: { type: "object", properties: { action: { type: "string", enum: ["list_workspaces", "list_boards", "list_lists", "list_cards", "search"] }, boardId: { type: "string" }, listId: { type: "string" }, query: { type: "string" } }, required: ["action"] },
  },
  describeForSafety: () => "read Trello boards and cards",
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "trello_read needs a valid action and its required id or query." };
    try {
      const args = parsed.data;
      const value = args.action === "list_workspaces" ? await listTrelloWorkspaces()
        : args.action === "list_boards" ? await listTrelloBoards()
          : args.action === "list_lists" ? await listTrelloLists(args.boardId)
            : args.action === "list_cards" ? await listTrelloCards(args.listId)
              : await searchTrello(args.query);
      return { ok: true, output: output(value) };
    } catch (error) {
      return { ok: false, output: error instanceof Error ? error.message : String(error) };
    }
  },
};
