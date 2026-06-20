import { z } from "zod";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Tool, ToolResult } from "./types.js";
import {
  createTicket,
  addComment,
  addAttachment,
  setInbox,
  setStatus,
  linkTicket,
  listTickets,
  getTicket,
  formatTicketBoard,
  TICKET_STATUSES,
  INBOX_STATES,
  type Ticket,
  type TicketDeps,
} from "../tickets/store.js";

// Tickets are internal issue objects in `.vanta/tickets.json` — no shell, no
// path arg, no network. A constant safety string keeps the kernel verdict Allow.
const SAFETY = "manage internal issue tickets";

const Args = z.object({
  action: z.enum(["create", "comment", "attach", "link", "inbox", "list", "board"]),
  id: z.string().optional(),
  title: z.string().optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  inbox: z.enum(INBOX_STATES).optional(),
  text: z.string().optional(),
  name: z.string().optional(),
  path: z.string().optional(),
  link: z.enum(["goal", "parent", "project"]).optional(),
  target: z.string().optional(),
  labels: z.array(z.string()).optional(),
});
type Parsed = z.infer<typeof Args>;

const deps = (): TicketDeps => ({ now: () => new Date(), id: () => `tkt-${randomUUID().slice(0, 8)}` });

function summarize(t: Ticket): string {
  return `${t.id} [${t.status}/${t.inbox}] — ${t.title}`;
}

function missing(id: string): ToolResult {
  return { ok: false, output: `no ticket "${id}"` };
}

async function doCreate(dir: string, a: Parsed): Promise<ToolResult> {
  if (!a.title) return { ok: false, output: "create needs a title" };
  const t = await createTicket(dir, { title: a.title, status: a.status, labels: a.labels }, deps());
  return { ok: true, output: `created ${summarize(t)}` };
}

async function doComment(dir: string, a: Parsed): Promise<ToolResult> {
  if (!a.id || !a.text) return { ok: false, output: "comment needs id and text" };
  const t = await addComment(dir, a.id, a.text, deps());
  return t ? { ok: true, output: `commented on ${t.id} (${t.comments.length} total)` } : missing(a.id);
}

async function doAttach(dir: string, a: Parsed): Promise<ToolResult> {
  if (!a.id || !a.name || !a.path) return { ok: false, output: "attach needs id, name, and path" };
  const t = await addAttachment(dir, a.id, { name: a.name, path: a.path }, deps());
  return t ? { ok: true, output: `attached ${a.name} to ${t.id}` } : missing(a.id);
}

async function doLink(dir: string, a: Parsed): Promise<ToolResult> {
  if (!a.id || !a.link || !a.target) return { ok: false, output: "link needs id, link (goal|parent|project), and target" };
  const t = await linkTicket(dir, a.id, { kind: a.link, targetId: a.target }, deps());
  return t ? { ok: true, output: `linked ${t.id} ${a.link}:${a.target}` } : missing(a.id);
}

async function doInbox(dir: string, a: Parsed): Promise<ToolResult> {
  if (!a.id) return { ok: false, output: "inbox needs id" };
  if (a.status) {
    const s = await setStatus(dir, a.id, a.status, deps());
    if (!s) return missing(a.id);
  }
  if (!a.inbox) {
    const t = await getTicket(dir, a.id);
    return t ? { ok: true, output: summarize(t) } : missing(a.id);
  }
  const t = await setInbox(dir, a.id, a.inbox, deps());
  return t ? { ok: true, output: `${t.id} → inbox:${t.inbox}` } : missing(a.id);
}

async function doBoard(dir: string): Promise<ToolResult> {
  return { ok: true, output: formatTicketBoard(await listTickets(dir)) };
}

async function doList(dir: string): Promise<ToolResult> {
  const all = await listTickets(dir);
  if (all.length === 0) return { ok: true, output: "No tickets yet." };
  return { ok: true, output: all.map(summarize).join("\n") };
}

const HANDLERS: Record<Parsed["action"], (dir: string, a: Parsed) => Promise<ToolResult>> = {
  create: doCreate,
  comment: doComment,
  attach: doAttach,
  link: doLink,
  inbox: doInbox,
  list: (dir) => doList(dir),
  board: (dir) => doBoard(dir),
};

export const ticketTool: Tool = {
  schema: {
    name: "ticket",
    description:
      "First-class issue tracker above goals, persisted in .vanta/tickets.json. " +
      "action:create {title, status?, labels?} opens an issue (default status open, inbox unread). " +
      "action:comment {id, text} appends a comment. action:attach {id, name, path} records an attachment reference. " +
      "action:link {id, link:goal|parent|project, target} links the issue to a goal/parent ticket/project. " +
      "action:inbox {id, inbox:unread|read|archived?, status?} sets inbox and/or status (omit both to show the ticket). " +
      "action:list lists every ticket; action:board renders the issue board grouped by status.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "comment", "attach", "link", "inbox", "list", "board"] },
        id: { type: "string", description: "ticket id (comment/attach/link/inbox)" },
        title: { type: "string", description: "ticket title (create)" },
        status: { type: "string", enum: [...TICKET_STATUSES], description: "open|in_progress|done|closed (create/inbox)" },
        inbox: { type: "string", enum: [...INBOX_STATES], description: "unread|read|archived (inbox)" },
        text: { type: "string", description: "comment body (comment)" },
        name: { type: "string", description: "attachment display name (attach)" },
        path: { type: "string", description: "attachment path/reference (attach)" },
        link: { type: "string", enum: ["goal", "parent", "project"], description: "link kind (link)" },
        target: { type: "string", description: "link target id (link)" },
        labels: { type: "array", items: { type: "string" }, description: "labels (create)" },
      },
      required: ["action"],
    },
  },
  describeForSafety: () => SAFETY,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'ticket needs an "action" (create|comment|attach|link|inbox|list|board)' };
    }
    const dir = join(ctx.root, ".vanta");
    return HANDLERS[parsed.data.action](dir, parsed.data);
  },
};
