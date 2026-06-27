import { TICKET_STATUSES } from "./store.js";
import type { Ticket, TicketLinks, TicketStatus, InboxState } from "./store.js";

/**
 * The ticket BOARD surface — pure presentation over the store's rows. Groups
 * tickets by status into the "viewable on a board" text; no persistence, no I/O.
 * Re-exported from `store.ts` so `formatTicketBoard` stays importable there.
 */

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
  closed: "Closed",
};

const INBOX_GLYPH: Record<InboxState, string> = { unread: "●", read: "○", archived: "▽" };

function formatLinks(links: TicketLinks): string {
  const parts: string[] = [];
  if (links.goalId) parts.push(`goal:${links.goalId}`);
  if (links.parentId) parts.push(`parent:${links.parentId}`);
  if (links.projectId) parts.push(`project:${links.projectId}`);
  return parts.length ? ` [${parts.join(" ")}]` : "";
}

function formatTicketLine(t: Ticket): string {
  const counts: string[] = [];
  if (t.comments.length) counts.push(`💬${t.comments.length}`);
  if (t.attachments.length) counts.push(`📎${t.attachments.length}`);
  const labels = t.labels.length ? ` (${t.labels.join(", ")})` : "";
  const meta = counts.length ? ` ${counts.join(" ")}` : "";
  return `  ${INBOX_GLYPH[t.inbox]} ${t.id} — ${t.title}${labels}${formatLinks(t.links)}${meta}`;
}

/**
 * Pure text board grouped by status — the "viewable on a board" surface. Empty
 * status columns are omitted; each ticket shows inbox glyph, links, and counts.
 */
export function formatTicketBoard(tickets: Ticket[]): string {
  if (tickets.length === 0) return "No tickets yet.";
  const sections: string[] = [];
  for (const status of TICKET_STATUSES) {
    const rows = tickets.filter((t) => t.status === status);
    if (rows.length === 0) continue;
    sections.push(`${STATUS_LABEL[status]} (${rows.length})`);
    for (const t of rows) sections.push(formatTicketLine(t));
  }
  return sections.join("\n");
}
