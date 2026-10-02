import { randomUUID } from "node:crypto";
import { resolvePermissionMode } from "../modes/permission-mode.js";
import { beginTtftTurn } from "../performance/ttft-trace.js";
import { globalFileCheckpointStore } from "../sessions/file-checkpoint.js";
import { detectAdaptiveSupport,injectAdaptiveSupport,type AdaptiveSupportPlan } from "./adaptive-support.js";
import type { AgentDeps } from "./agent-types.js";
import { beginTurnContext,prepareCallMessages } from "./context-pipeline.js";
import type { DispatchOutcome } from "./dispatch-tool.js";
import { completeAndRecordUsage } from "./provider-usage.js";
import { schemasWithStructuredOutput } from "./structured-output.js";
import {
buildToolClosureDirective,
effectiveToolBudget,
resolveToolBudget,
resolveToolClosureReserve,
scopeToolsForClosure
} from "./tool-budget.js";
import { scopeToolSchemas,toolScopeContext } from "./tool-scope.js";
import { makeInitialState } from "./turn-state.js";

import type { TurnOpts } from "./turn-loop.js";

export function usesCorrectionLeash(plan: AdaptiveSupportPlan, deps: AgentDeps): boolean {
  const mode = deps.permissionMode?.() ?? resolvePermissionMode(process.env);
  return plan.signals.includes("correction") && mode !== "auto" && mode !== "fullAccess";
}

export function prepareTurnRuntime(opts: TurnOpts) {
  const { messages, ctx, deps, userText, images, signal } = opts;
  const effectScopeId = ctx.effectScopeId ?? deps.sessionId ?? `turn:${randomUUID()}`;
  const ttft = beginTtftTurn(deps.usageAgent ?? "agent");
  const effectiveSignal = signal ?? deps.signal;
  const maxIter = deps.maxIterations ?? 50;
  const adaptiveSupport = detectAdaptiveSupport(userText, messages);
  // DRIFT-HARD-ENFORCE: per-turn tool-budget breaker. Manual/Accept edits tighten
  // during a correction; Auto/Full access keep the bounded general ceiling.
  const toolBudget = resolveToolBudget(process.env);
  const toolClosureReserve = resolveToolClosureReserve(process.env);
  const correcting = usesCorrectionLeash(adaptiveSupport, deps);
  const hardToolBudget = effectiveToolBudget(correcting, toolBudget);
  messages.push(images?.length ? { role: "user", content: userText, images } : { role: "user", content: userText });
  const state = makeInitialState();
  // OP-CHECKPOINT-ROLLBACK: mark a new turn so file snapshots group per turn.
  globalFileCheckpointStore.beginTurn(); const turnCtx = beginTurnContext(messages, deps);
  return { opts, effectScopeId, ttft, effectiveSignal, maxIter, adaptiveSupport, toolBudget, toolClosureReserve, correcting, hardToolBudget, state, turnCtx };
}

export type TurnRuntime = ReturnType<typeof prepareTurnRuntime>;

export async function completeTurnIteration(runtime: TurnRuntime, iter: number) {
  const { opts: { messages, ctx, deps }, state, hardToolBudget, adaptiveSupport, turnCtx, effectiveSignal, ttft } = runtime;
  // Scope schemas once per iteration so countTokens and getCompletion use the same set.
  const scoped = scopeToolSchemas(deps.registry.schemas(), toolScopeContext(messages, deps.activeGoalText), { env: process.env });
  const phaseScoped = state.toolBudgetClosure ? scopeToolsForClosure(scoped) : scoped;
  const schemas = schemasWithStructuredOutput(phaseScoped, deps.outputSchema);
  const depsWithTools = { ...deps, currentTools: schemas };
  const prepared = await prepareCallMessages(messages, depsWithTools, iter, turnCtx);
  const redirectForCall = state.adaptiveRedirect;
  state.adaptiveRedirect = "";
  const closureDirective = state.toolBudgetClosure ? buildToolClosureDirective(state.openTodoCount) : "";
  const trimmed = injectAdaptiveSupport(prepared, [adaptiveSupport.directive, redirectForCall, closureDirective]);
  const prefetched = new Map<string, Promise<DispatchOutcome>>();
  const prefetchLimit = hardToolBudget > 0 ? Math.max(0, hardToolBudget - state.toolIterations) : undefined;
  const completion = await completeAndRecordUsage({
    deps,
    depsWithTools,
    messages: trimmed,
    turnCtx,
    signal: effectiveSignal,
    providerCall: { ctx, prefetched, schemas, ...(prefetchLimit === undefined ? {} : { prefetchLimit }), ttft },
  });
  return { schemas, prefetched, completion };
}
