import type { Message, ToolCall } from "../types.js";
import type { ToolContext } from "../tools/types.js";
import type { AgentDeps } from "./agent-types.js";
import type { TurnState } from "./turn-state.js";
import { interruptedDisposition, interruptedToolResult } from "./effect-disposition.js";
import { persistEffectTransition } from "./effect-persistence.js";
import { unansweredCalls } from "./tool-pairing.js";

// Closing out a tool batch so every emitted `tool_use` gets exactly one result,
// in call order. Extracted from turn-loop.ts: the loop has several early exits
// (stuck tool, closure block, StructuredOutput ending the turn) and each one
// used to abandon the remaining calls, which bricks the session on the next
// request. See agent/tool-pairing.ts for the invariant these uphold.

/**
 * Answer every call in a batch that StructuredOutput ended. The StructuredOutput
 * call gets the real payload; its siblings get a no-effect stub, because the turn
 * returns before they ever run.
 */
export function settleStructuredBatch(calls: ToolCall[], output: string, messages: Message[]): void {
  for (const call of calls) {
    if (call.name === "StructuredOutput") {
      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: output, effectDisposition: "none" });
      continue;
    }
    messages.push(interruptedToolResult(call, "none"));
  }
}

const BUDGET_STOP = "Not executed: the turn reached its hard tool-call safety limit.";

/** Answer the calls left when the hard tool-call budget closes the batch. */
export async function settleBudgetExhausted(args: SettleArgs): Promise<void> {
  const { calls, messages, ctx, deps, state } = args;
  for (const skipped of calls) {
    messages.push({ role: "tool", toolCallId: skipped.id, name: skipped.name, content: BUDGET_STOP, effectDisposition: "none" });
    await persistEffectTransition(ctx.root, deps.sessionId, skipped, "settled", "none");
    state.workItemStates.push("stopped");
  }
}

type SettleArgs = {
  calls: ToolCall[];
  messages: Message[];
  ctx: ToolContext;
  deps: AgentDeps;
  state: TurnState;
};

/**
 * Backfill a result for any call the batch loop never reached. `effectState` is
 * the only honest signal for whether the tool actually started, so a mutator that
 * began work is reported as `unknown` rather than "did not happen".
 */
export async function settleUnansweredCalls(args: SettleArgs): Promise<void> {
  const { calls, messages, ctx, deps, state } = args;
  for (const call of unansweredCalls(calls, messages)) {
    const disposition = interruptedDisposition(call, call.effectState === "started");
    messages.push(interruptedToolResult(call, disposition));
    await persistEffectTransition(ctx.root, deps.sessionId, call, "settled", disposition);
    state.workItemStates.push("stopped");
  }
}
