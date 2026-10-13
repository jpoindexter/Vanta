import type { CompanyCtx } from "./company-context.js";
import { buildWorker } from "./company-roster.js";
import { loadSnapshot, type CompanySnapshot } from "./company-snapshot.js";
import { buildSummary } from "./company-tickets.js";
import { broadcastTyped } from "./company-broadcast.js";
import { budgetAlertEvent, ticketUpdatedEvent, workerStatusEvent } from "./typed-events.js";

// Push `ticket.updated` and `worker.status` for what just changed. Events are
// hints: the payload is the same summary GET returns, so a missed frame is
// repaired by the next read.

export type Announce = { ticketId?: string; workerId?: string; snap?: CompanySnapshot };

export async function announce(ctx: CompanyCtx, what: Announce): Promise<void> {
  const snap = what.snap ?? await loadSnapshot(ctx);
  if (what.ticketId) {
    const summary = buildSummary(snap, what.ticketId);
    if (summary) broadcastTyped(ctx, ticketUpdatedEvent(summary));
  }
  const worker = what.workerId ? snap.workers.find((w) => w.id === what.workerId) : undefined;
  if (worker) {
    const view = buildWorker(snap, worker);
    broadcastTyped(ctx, workerStatusEvent({
      workerId: view.id,
      status: view.status,
      currentTicketId: view.currentTicketId,
      lastHeartbeat: view.lastHeartbeat,
      costUsd: view.costUsd,
    }));
  }
}

export function announceBudget(ctx: CompanyCtx, alert: { scope: string; level: "warning" | "exceeded"; spentUsd: number; limitUsd: number }): void {
  broadcastTyped(ctx, budgetAlertEvent(alert));
}
