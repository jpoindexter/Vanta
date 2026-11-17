import type { CompanyCtx } from "./company-context.js";
import { pushTypedEvent } from "./typed-emit.js";
import type { TypedDesktopEvent } from "./typed-events.js";

/**
 * Company events go to EVERY connected desktop client, not only the one whose
 * request caused them: the Company screen must update from any window. Chat
 * events stay per-client; this is the one deliberate exception.
 */
export function broadcastTyped(ctx: CompanyCtx, typed: TypedDesktopEvent | null): void {
  const clients = ctx.host._sseClients;
  if (!clients || !typed) return;
  for (const sessionId of [...clients.keys()]) pushTypedEvent({ _sseClients: clients, _sseSessionId: sessionId }, typed);
}
