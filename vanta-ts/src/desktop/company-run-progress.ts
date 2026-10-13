import type { RunEvent } from "../worker-runtimes/types.js";
import { recordActivity } from "./company-activity.js";
import type { CompanyCtx } from "./company-context.js";

// Streams a running worker's progress into the company activity feed (and so
// over SSE as `activity.appended`). Heartbeat-only status lines are not logged,
// bursts are thinned, and a run is capped, so a chatty CLI cannot flood the feed.

const MIN_GAP_MS = 1000;
const MAX_ENTRIES_PER_RUN = 60;

export type ProgressSink = { onEvent: (event: RunEvent) => void; flush: () => Promise<void> };

export function createProgressSink(ctx: CompanyCtx, who: { workerId: string; ticketId: string }): ProgressSink {
  let chain: Promise<unknown> = Promise.resolve();
  let lastAt = 0;
  let logged = 0;
  return {
    onEvent(event) {
      const now = ctx.ports.now().getTime();
      if (event.kind === "status" || event.kind === "usage" || logged >= MAX_ENTRIES_PER_RUN || now - lastAt < MIN_GAP_MS) return;
      lastAt = now;
      logged += 1;
      chain = chain.then(() => recordActivity(ctx, { kind: "run.progress", actor: who.workerId, summary: event.text, refs: { ticketId: who.ticketId, workerId: who.workerId } })).catch(() => undefined);
    },
    flush: async () => { await chain; },
  };
}
