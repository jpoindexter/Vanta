import type { ToolResult } from "../tools/types.js";

// PLUGIN-HOOKS: lifecycle hook bus for Vanta plugins.
// Plugins register handlers that fire at key points in the agent lifecycle.
// The bus is synchronous where possible, async where needed. Best-effort:
// a hook that throws is logged and skipped, never crashes the session.

export type HookEvent =
  | "pre_tool_call"
  | "post_tool_call"
  | "pre_llm_call"
  | "post_llm_call"
  | "on_session_start"
  | "on_session_end"
  | "on_session_reset"
  | "subagent_stop"
  | "pre_gateway_dispatch"
  | "message_display";

export type HookContext = {
  pre_tool_call: { name: string; args: Record<string, unknown> };
  post_tool_call: { name: string; args: Record<string, unknown>; result: ToolResult };
  pre_llm_call: { messages: unknown[]; tools: unknown[] };
  post_llm_call: { text: string; toolCalls: unknown[] };
  on_session_start: { sessionId: string };
  on_session_end: { sessionId: string; turns: number };
  on_session_reset: Record<string, never>;
  subagent_stop: { reason: string };
  pre_gateway_dispatch: { chatId: string; text: string; platform: string };
  message_display: { text: string; role: "assistant" };
};

export type HookAction<E extends HookEvent = HookEvent> =
  E extends "pre_gateway_dispatch"
    ? { action: "allow" | "skip" | "rewrite"; rewrittenText?: string }
    : E extends "message_display"
      ? { action: "allow" | "suppress" | "rewrite"; rewrittenText?: string }
      : void;

export type HookHandler<E extends HookEvent = HookEvent> = (
  ctx: HookContext[E],
) => Promise<HookAction<E>> | HookAction<E>;

type AnyHookHandler = (ctx: unknown) => Promise<unknown> | unknown;

/**
 * A lightweight hook bus. Plugins call `bus.on(event, handler)` to register.
 * The agent/gateway calls `bus.fire(event, ctx)` to run all handlers.
 */
export class HookBus {
  private readonly handlers = new Map<HookEvent, AnyHookHandler[]>();

  /** Register a handler for an event. Returns an unsubscribe function. */
  on<E extends HookEvent>(event: E, handler: HookHandler<E>): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler as AnyHookHandler);
    return () => {
      const list = this.handlers.get(event) ?? [];
      const idx = list.indexOf(handler as AnyHookHandler);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  /**
   * Fire an event. Runs all handlers sequentially.
   * For the actionable events (pre_gateway_dispatch, message_display) the FIRST
   * non-allow action wins. All other hooks are fire-and-forget (errors logged,
   * never thrown).
   */
  async fire<E extends HookEvent>(event: E, ctx: HookContext[E]): Promise<HookAction<E>> {
    const list = this.handlers.get(event) ?? [];
    const actionable = event === "pre_gateway_dispatch" || event === "message_display";
    for (const handler of list) {
      try {
        const result = await handler(ctx);
        if (actionable && result && (result as { action: string }).action !== "allow") {
          return result as HookAction<E>;
        }
      } catch (err) {
        // Best-effort: log and continue.
        console.warn(`hook error [${event}]: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return (actionable ? { action: "allow" } : undefined) as HookAction<E>;
  }

  /** How many handlers are registered for an event. For testing. */
  count(event: HookEvent): number {
    return this.handlers.get(event)?.length ?? 0;
  }

  /** Clear all handlers (used in tests). */
  clear(): void {
    this.handlers.clear();
  }
}

/** The global singleton bus. Plugins register here; the agent reads from here. */
export const globalHookBus = new HookBus();
