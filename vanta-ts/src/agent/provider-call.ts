// PROVIDER-CALL — the model-call seam extracted from turn-loop (size gate). Builds the scoped
// tool schemas, runs the streaming-or-complete provider call, and wraps it with transient-retry +
// context-window compaction. Kept here so turn-loop stays under the size limit and the retry
// policy is independently testable.
import type { CompletionResult, ToolSchema } from "../providers/interface.js";
import type { ToolCall, Message } from "../types.js";
import type { ToolContext } from "../tools/types.js";
import type { AgentDeps } from "./agent-types.js";
import type { DispatchOutcome } from "./dispatch-tool.js";
import { sanitizeMessages } from "../context.js";
import { beginTurnContext, compressAfterContextError, isContextLengthError } from "./context-pipeline.js";
import { scopeToolSchemas, toolScopeContext } from "./tool-scope.js";
import { schemasWithStructuredOutput } from "./structured-output.js";
import { consumeStream } from "./stream-dispatch.js";
import { dispatchTool } from "./dispatch-tool.js";
import { isTransientError, resolveProviderRetries } from "../tool-retry.js";

export type ProviderCall = {
  ctx: ToolContext;
  prefetched: Map<string, Promise<DispatchOutcome>>;
  schemas: ToolSchema[];
};

export type CompletionRetryArgs = {
  deps: AgentDeps;
  depsWithTools: AgentDeps & { currentTools: ToolSchema[] };
  messages: Message[];
  turnCtx: ReturnType<typeof beginTurnContext>;
  signal?: AbortSignal;
  providerCall: ProviderCall;
};

/**
 * Run the model call, surviving transient provider failures. A long unattended run makes many
 * calls; a transient hiccup on one (idle/request timeout, 429, connection reset) must not crash
 * the whole run. Transient errors are retried (bounded, with backoff) then stopped gracefully; a
 * non-transient error (auth, bad request) fails fast; a context-window error falls to one
 * compaction retry. PROVIDER-HARDENING — found by the long-run stress harness.
 */
export async function getCompletionWithContextRetry(
  args: CompletionRetryArgs,
): Promise<{ ok: true; result: CompletionResult } | { ok: false; error: string }> {
  const retries = resolveProviderRetries(process.env);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return { ok: true, result: await getCompletion(args.deps, sanitizeMessages(args.messages), args.signal, args.providerCall) };
    } catch (err) {
      if (isContextLengthError(err)) break; // context window → compaction path below
      if (!isTransientError(err)) throw err; // non-transient → fail fast (a real bug, not a hiccup)
      if (attempt >= retries || args.signal?.aborted) {
        return { ok: false, error: `Stopped: provider error after ${attempt + 1} attempt(s) — ${err instanceof Error ? err.message : String(err)}` };
      }
      await backoff(attempt);
    }
  }
  const compacted = await compressAfterContextError(args.messages, args.depsWithTools, args.turnCtx);
  try {
    return { ok: true, result: await getCompletion(args.deps, sanitizeMessages(compacted), args.signal, args.providerCall) };
  } catch (err) {
    if (!isContextLengthError(err)) throw err;
    return { ok: false, error: "Stopped: provider context window exceeded after one compaction retry." };
  }
}

function backoff(attempt: number): Promise<void> {
  const raw = Number(process.env.VANTA_PROVIDER_RETRY_BACKOFF_MS ?? 500);
  const ms = (Number.isFinite(raw) && raw >= 0 ? raw : 500) * (attempt + 1);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getCompletion(
  deps: AgentDeps,
  messages: Message[],
  signal?: AbortSignal,
  pf?: { ctx: ToolContext; prefetched: Map<string, Promise<DispatchOutcome>>; schemas?: ToolSchema[] },
): Promise<CompletionResult> {
  const schemas = pf?.schemas ?? schemasWithStructuredOutput(
    scopeToolSchemas(deps.registry.schemas(), toolScopeContext(messages, deps.activeGoalText), { env: process.env }),
    deps.outputSchema,
  );
  const cfg = { ...(signal ? { signal } : {}), effortLevel: deps.getEffortLevel?.() };
  if (deps.provider.stream && deps.onTextDelta) {
    const onSafeToolCall = pf
      ? (call: ToolCall) => {
          if (!pf.prefetched.has(call.id)) pf.prefetched.set(call.id, dispatchTool(call, deps, pf.ctx));
        }
      : undefined;
    const result = await consumeStream({ stream: deps.provider.stream(messages, schemas, cfg), onTextDelta: deps.onTextDelta, onThinkingDelta: deps.onThinkingDelta, signal, onSafeToolCall });
    if (result) return result;
  }
  return deps.provider.complete(messages, schemas, cfg);
}
