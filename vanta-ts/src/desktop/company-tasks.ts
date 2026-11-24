import { appendTask, type TaskStatus, type WorkerTask } from "../team/tasks.js";
import { getTicket, setStatus, type TicketDeps, type TicketStatus } from "../tickets/store.js";
import type { CompanyCtx } from "./company-context.js";

// One place that writes a task row and keeps the ticket row's status in step,
// so `/tickets` and the company views never disagree about a ticket.

const TICKET_STATUS_FOR_TASK: Record<TaskStatus, TicketStatus> = {
  assigned: "open",
  running: "in_progress",
  blocked: "in_progress",
  done: "done",
  stopped: "open",
  removed: "closed",
};

export function ticketDeps(ctx: CompanyCtx): TicketDeps {
  return { now: ctx.ports.now, id: ctx.ports.newId };
}

export async function persistTask(ctx: CompanyCtx, task: WorkerTask): Promise<void> {
  await appendTask(task, ctx.env);
  const ticket = await getTicket(ctx.dataDir, task.id);
  const next = TICKET_STATUS_FOR_TASK[task.status];
  if (ticket && ticket.status !== next) await setStatus(ctx.dataDir, task.id, next, ticketDeps(ctx));
}
