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
import { classifyProviderError } from "../providers/error-taxonomy.js";
import { stripAllImages } from "./image-recovery.js";

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
      const action = await handleAttemptError(err, args, attempt, retries);
      if (action === "compact") break; // context window → the compaction path below
      if (action !== "retry") return action; // a settled result (image recovery or a stop)
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

type SettledResult = { ok: true; result: CompletionResult } | { ok: false; error: string };
type AttemptAction = SettledResult | "compact" | "retry";

/**
 * Decide what a failed completion attempt should do: "compact" (context-window
 * error → the compaction path), a settled result (413/image recovery, or the
 * stop verdict once retries are spent), "retry" (transient → backoff + loop), or
 * throw (non-transient). Extracted so the loop stays under the size gate.
 */
async function handleAttemptError(err: unknown, args: CompletionRetryArgs, attempt: number, retries: number): Promise<AttemptAction> {
  if (isContextLengthError(err)) return "compact";
  // HARNESS-IMAGE-SHRINK: a 413/image_too_large is recoverable by stripping the
  // oversized image parts and retrying as text — once, before giving up.
  const imgRetry = await tryImageStripRetry(err, args);
  if (imgRetry) return imgRetry;
  if (!isTransientError(err)) throw err; // non-transient → fail fast (a real bug, not a hiccup)
  if (attempt >= retries || args.signal?.aborted) {
    return { ok: false, error: `Stopped: provider error after ${attempt + 1} attempt(s) — ${err instanceof Error ? err.message : String(err)}` };
  }
  return "retry";
}

/** HARNESS-IMAGE-SHRINK — if `err` is a 413/image error and the messages carry
 * images, strip them and retry ONCE as text; else null (let the normal path run). */
async function tryImageStripRetry(
  err: unknown,
  args: CompletionRetryArgs,
): Promise<{ ok: true; result: CompletionResult } | { ok: false; error: string } | null> {
  const reason = classifyProviderError(err).reason;
  if (reason !== "image_too_large" && reason !== "payload_too_large") return null;
  const { messages: stripped, stripped: n } = stripAllImages(args.messages);
  if (n === 0) return null; // no images to shed → not the recoverable case
  try {
    return { ok: true, result: await getCompletion(args.deps, sanitizeMessages(stripped), args.signal, args.providerCall) };
  } catch (retryErr) {
    return { ok: false, error: `Stopped: image too large; retry without ${n} image(s) also failed — ${retryErr instanceof Error ? retryErr.message : String(retryErr)}` };
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
