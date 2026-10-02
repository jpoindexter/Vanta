import { join } from "node:path";
import { compactOversizedResult } from "../compress/reactive.js";
import { buildAgentHookDeps } from "../hooks/agent-hook-deps.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import { DEFAULT_ERRORDETECT_THRESHOLD } from "../repl/error-detect.js";
import type { ToolContext } from "../tools/types.js";
import type { Message,ToolCall } from "../types.js";
import { runAdvisor } from "./advisor.js";
import type { AgentDeps } from "./agent-types.js";
import { dispatchTool,type DispatchOutcome } from "./dispatch-tool.js";
import { interruptedDisposition,interruptedToolResult } from "./effect-disposition.js";
import { checkpointToolTranscript,persistEffectTransition } from "./effect-persistence.js";
import { settleBudgetExhausted,settleUnansweredCalls } from "./settle-batch.js";
import { isToolAllowedDuringClosure } from "./tool-budget.js";
import { assertToolPairing } from "./tool-pairing.js";
import type { TurnState } from "./turn-state.js";
import { recordToolOutcome } from "./turn-state.js";

/**
 * Log a tool result to the kernel event log as status + size ONLY — never the
 * raw output. Tool output can carry secrets (read_file of .env, gmail of a key
 * email); the full result already lives in the session transcript, so the
 * world-readable, audit-sealed event log only needs a marker. Best-effort: a
 * log failure must never abort a turn.
 */
async function logToolOutcome(deps: AgentDeps, name: string, ok: boolean, chars: number): Promise<void> {
  try {
    await deps.safety.logEvent(`${name}: ${ok ? "ok" : "err"} (${chars} chars)`);
  } catch {
    /* best-effort */
  }
}

type ProcessToolCallsArgs = {
  calls: ToolCall[];
  deps: AgentDeps;
  ctx: ToolContext;
  state: TurnState;
  messages: Message[];
  hardToolBudget: number;
  toolBudgetClosure: boolean;
  prefetched?: Map<string, Promise<DispatchOutcome>>;
};

function maybeRunAdvisor(messages: Message[], deps: AgentDeps, state: TurnState): void {
  const threshold = DEFAULT_ERRORDETECT_THRESHOLD;
  if (!deps.advisorProvider || state.consecutiveErrorResults < threshold || state.consecutiveErrorResults % threshold !== 0) return;
  void runAdvisor(messages, deps.advisorProvider, state.consecutiveErrorResults)
    .then((text) => { deps.onText?.(`\n🔍 Advisor (${state.consecutiveErrorResults} consecutive failures):\n${text}`); })
    .catch(() => { /* best-effort */ });
}

type ToolBatch = Array<{ name: string; ok: boolean; output: string }>;

async function closeAcquisitionCall(args: ProcessToolCallsArgs, call: ToolCall, batch: ToolBatch): Promise<string | null> {
  const { deps, ctx, state, messages } = args;
  const output = "Not executed: broad search and browser acquisition are closed for this turn. Finish from the evidence already collected.";
  const outcome: DispatchOutcome = {
    executed: false,
    empty: false,
    ok: false,
    output,
    effectDisposition: "none",
    workItemState: "stopped",
  };
  batch.push({ name: call.name, ok: false, output });
  state.toolNames.push(call.name);
  state.toolIterations++;
  messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: output, effectDisposition: "none" });
  await persistEffectTransition(ctx.root, deps.sessionId, call, "settled", "none");
  await checkpointToolTranscript(deps.sessionId, messages);
  await logToolOutcome(deps, call.name, false, output.length);
  return recordToolOutcome(state, call, outcome, deps);
}

async function dispatchTrackedCall(args: ProcessToolCallsArgs, call: ToolCall): Promise<DispatchOutcome> {
  const { deps, ctx, messages, prefetched } = args;
  const inFlight = prefetched?.get(call.id);
  let executionStarted = false;
  const trackedCtx: ToolContext = {
    ...ctx,
    onToolExecutionStart: async () => {
      executionStarted = true;
      call.effectState = "started";
      await persistEffectTransition(ctx.root, deps.sessionId, call, "started");
      await checkpointToolTranscript(deps.sessionId, messages);
    },
  };
  let outcome: DispatchOutcome;
  try {
    outcome = inFlight ? await inFlight : await dispatchTool(call, deps, trackedCtx);
  } catch (error) {
    const disposition = interruptedDisposition(call, executionStarted);
    const synthetic = interruptedToolResult(call, disposition);
    outcome = {
      executed: executionStarted,
      empty: false,
      ok: false,
      output: `${synthetic.content}\nError: ${error instanceof Error ? error.message : String(error)}`,
      effectDisposition: disposition,
      workItemState: disposition === "unknown" ? "unverified" : "failed",
    };
  }
  return outcome;
}

async function settleCall(args: ProcessToolCallsArgs, call: ToolCall, outcome: DispatchOutcome, batch: ToolBatch): Promise<string | null> {
  const { deps, ctx, state, messages } = args;
  batch.push({ name: call.name, ok: outcome.ok, output: outcome.output });
  state.toolNames.push(call.name);
  state.toolIterations++;
  if (outcome.tokensSaved) state.tokensSaved += outcome.tokensSaved;
  const reactive = compactOversizedResult(outcome.output, { contextWindow: deps.provider.contextWindow() });
  if (reactive.tokensSaved) state.tokensSaved += reactive.tokensSaved;
  messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: reactive.output, effectDisposition: outcome.effectDisposition });
  await persistEffectTransition(
    ctx.root,
    deps.sessionId,
    call,
    "settled",
    outcome.effectDisposition,
    outcome.workItemState,
  );
  await checkpointToolTranscript(deps.sessionId, messages);
  await logToolOutcome(deps, call.name, outcome.ok, reactive.output.length);
  const stuck = recordToolOutcome(state, call, outcome, deps);
  maybeRunAdvisor(messages, deps, state);
  return stuck;
}

export async function processToolCalls(args: ProcessToolCallsArgs): Promise<{ stuckTool: string | null; budgetExhausted: boolean }> {
  const { calls, deps, ctx, state, messages, hardToolBudget, toolBudgetClosure } = args;
  const batch: ToolBatch = [];
  let stuckTool: string | null = null;
  let budgetExhausted = false;
  for (let index = 0; index < calls.length; index++) {
    const call = calls[index]!;
    if (hardToolBudget > 0 && state.toolIterations >= hardToolBudget) {
      budgetExhausted = true;
      await settleBudgetExhausted({ calls: calls.slice(index), messages, ctx, deps, state });
      await checkpointToolTranscript(deps.sessionId, messages);
      break;
    }
    if (toolBudgetClosure && !isToolAllowedDuringClosure(call.name)) {
      stuckTool = await closeAcquisitionCall(args, call, batch);
    } else {
      const outcome = await dispatchTrackedCall(args, call);
      stuckTool = await settleCall(args, call, outcome, batch);
    }
    if (stuckTool) break;
  }
  // Single settle point for every early exit above (a stuck tool breaks the loop
  // and leaves the rest of the batch un-answered). One result per call is a
  // transcript invariant, not a happy-path nicety — see agent/tool-pairing.ts.
  await settleUnansweredCalls({ calls, messages, ctx, deps, state });
  await checkpointToolTranscript(deps.sessionId, messages);
  assertToolPairing(messages, "processToolCalls");
  await fireHooks(join(ctx.root, ".vanta"), "PostToolBatch", { tools: batch }, { cwd: ctx.root, ...buildAgentHookDeps(deps) });
  return { stuckTool, budgetExhausted };
}
