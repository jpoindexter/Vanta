import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

/**
 * Tickets — first-class issue objects above goals. A ticket carries its own
 * status + inbox state, links up to a goal/parent/project, and accrues comments
 * and attachments over its life. Persisted as a `{version,tickets}` envelope at
 * `.vanta/tickets.json` (project data dir). Tolerant reader: a malformed row is
 * skipped, a corrupt file degrades to an empty board — one bad write never
 * bricks the issue tracker.
 */

export const TICKET_STATUSES = ["open", "in_progress", "done", "closed"] as const;
export const INBOX_STATES = ["unread", "read", "archived"] as const;

const CommentSchema = z.object({ at: z.string(), text: z.string() });
const AttachmentSchema = z.object({ name: z.string(), path: z.string() });
const LinksSchema = z.object({
  goalId: z.string().optional(),
  parentId: z.string().optional(),
  projectId: z.string().optional(),
});

export const TicketSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(TICKET_STATUSES),
  inbox: z.enum(INBOX_STATES),
  links: LinksSchema,
  labels: z.array(z.string()),
  comments: z.array(CommentSchema),
  attachments: z.array(AttachmentSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const StoreSchema = z.object({
  version: z.literal(1),
  tickets: z.array(TicketSchema),
});

export type Ticket = z.infer<typeof TicketSchema>;
export type TicketComment = z.infer<typeof CommentSchema>;
export type TicketAttachment = z.infer<typeof AttachmentSchema>;
export type TicketLinks = z.infer<typeof LinksSchema>;
export type TicketStatus = Ticket["status"];
export type InboxState = Ticket["inbox"];
export type LinkKind = "goal" | "parent" | "project";

/** Injected clock + id factory so create/update are deterministic in tests. */
export type TicketDeps = { now: () => Date; id: () => string };

export function ticketsPath(dataDir: string): string {
  return join(dataDir, "tickets.json");
}

/**
 * Read tickets tolerantly: an unreadable/corrupt file → []; within a valid-shape
 * envelope, rows that fail the schema are dropped rather than failing the read.
 */
export async function listTickets(dataDir: string): Promise<Ticket[]> {
  let raw: string;
  try {
    raw = await readFile(ticketsPath(dataDir), "utf8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const rows = (parsed as { tickets?: unknown })?.tickets;
  if (!Array.isArray(rows)) return [];
  const out: Ticket[] = [];
  for (const row of rows) {
    const r = TicketSchema.safeParse(row);
    if (r.success) out.push(r.data);
  }
  return out;
}

export async function getTicket(dataDir: string, id: string): Promise<Ticket | undefined> {
  return (await listTickets(dataDir)).find((t) => t.id === id);
}

async function writeAll(dataDir: string, tickets: Ticket[]): Promise<void> {
  const path = ticketsPath(dataDir);
  await mkdir(dirname(path), { recursive: true });
  const store = StoreSchema.parse({ version: 1, tickets });
  await writeFile(path, JSON.stringify(store, null, 2) + "\n", "utf8");
}

/** Replace the row with the given id (updatedAt stamped) and persist. */
async function patchTicket(
  dataDir: string,
  id: string,
  patch: (t: Ticket) => Ticket,
  now: Date,
): Promise<Ticket | undefined> {
  const tickets = await listTickets(dataDir);
  const idx = tickets.findIndex((t) => t.id === id);
  if (idx === -1) return undefined;
  const updated = { ...patch(tickets[idx]!), updatedAt: now.toISOString() };
  tickets[idx] = updated;
  await writeAll(dataDir, tickets);
  return updated;
}

export async function createTicket(
  dataDir: string,
  input: { title: string; status?: TicketStatus; links?: TicketLinks; labels?: string[] },
  deps: TicketDeps,
): Promise<Ticket> {
  const at = deps.now().toISOString();
  const ticket: Ticket = {
    id: deps.id(),
    title: input.title,
    status: input.status ?? "open",
    inbox: "unread",
    links: input.links ?? {},
    labels: input.labels ?? [],
    comments: [],
    attachments: [],
    createdAt: at,
    updatedAt: at,
  };
  await writeAll(dataDir, [...(await listTickets(dataDir)), ticket]);
  return ticket;
}

export async function addComment(
  dataDir: string,
  id: string,
  text: string,
  deps: TicketDeps,
): Promise<Ticket | undefined> {
  const at = deps.now().toISOString();
  return patchTicket(dataDir, id, (t) => ({ ...t, comments: [...t.comments, { at, text }] }), deps.now());
}

export async function addAttachment(
  dataDir: string,
  id: string,
  attachment: TicketAttachment,
  deps: TicketDeps,
): Promise<Ticket | undefined> {
  return patchTicket(
    dataDir,
    id,
    (t) => ({ ...t, attachments: [...t.attachments, attachment] }),
    deps.now(),
  );
}

export async function setInbox(
  dataDir: string,
  id: string,
  inbox: InboxState,
  deps: TicketDeps,
): Promise<Ticket | undefined> {
  return patchTicket(dataDir, id, (t) => ({ ...t, inbox }), deps.now());
}

export async function setStatus(
  dataDir: string,
  id: string,
  status: TicketStatus,
  deps: TicketDeps,
): Promise<Ticket | undefined> {
  return patchTicket(dataDir, id, (t) => ({ ...t, status }), deps.now());
}

const LINK_KEY: Record<LinkKind, keyof TicketLinks> = {
  goal: "goalId",
  parent: "parentId",
  project: "projectId",
};

/** Link a ticket up to a goal, parent ticket, or project (sets one link key). */
export async function linkTicket(
  dataDir: string,
  id: string,
  link: { kind: LinkKind; targetId: string },
  deps: TicketDeps,
): Promise<Ticket | undefined> {
  const key = LINK_KEY[link.kind];
  return patchTicket(dataDir, id, (t) => ({ ...t, links: { ...t.links, [key]: link.targetId } }), deps.now());
}

// The pure board-presentation surface lives in `board.ts`; re-exported here so
// `formatTicketBoard` stays importable from `tickets/store.ts` (zero importer edits).
export { formatTicketBoard } from "./board.js";
