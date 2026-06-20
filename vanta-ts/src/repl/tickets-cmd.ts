import { listTickets, formatTicketBoard } from "../tickets/store.js";
import type { SlashHandler } from "./types.js";

// `/tickets` — view the issue board: first-class tickets grouped by status,
// each with its inbox state, goal/parent/project links, and comment/attachment
// counts. A window onto the `ticket` tool's store (`.vanta/tickets.json`).

export const tickets: SlashHandler = async (_arg, ctx) => {
  const all = await listTickets(ctx.dataDir);
  if (all.length === 0) {
    return {
      output:
        "No tickets yet.\n  Open a first-class issue with the ticket tool (action:create) — it links to goals, takes comments + attachments, and shows on this board.",
    };
  }
  const open = all.filter((t) => t.status === "open" || t.status === "in_progress").length;
  const unread = all.filter((t) => t.inbox === "unread").length;
  const head = `${all.length} ticket(s) · ${open} active · ${unread} unread`;
  return { output: [head, formatTicketBoard(all)].join("\n") };
};
