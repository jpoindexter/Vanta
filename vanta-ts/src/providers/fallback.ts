// MODEL-FALLBACK — provider fallback chain on transient failure.
// On network / rate-limit / 5xx errors, tries the next provider in the
// chain before surfacing the error. Auth failures (4xx) propagate immediately —
// retrying a bad key just wastes time.

import { resolveProvider } from "./index.js";
import { classifyProviderError } from "./error-taxonomy.js";
import type { LLMProvider, CompletionResult, CompletionConfig, StreamChunk } from "./interface.js";
import type { Message, ToolCall } from "../types.js";
import type { ToolSchema } from "./interface.js";

/**
 * Returns true for auth errors — never fall back on those (a bad key won't be
 * fixed by trying again). Both transient (refreshable token) and permanent
 * (revoked key) auth verdicts propagate immediately here.
 */
function isAuthError(err: unknown): boolean {
  if (isPoolExhaustion(err)) return false;
  const reason = classifyProviderError(err).reason;
  return reason === "auth" || reason === "auth_permanent";
}

/**
 * Returns true when the error warrants trying the next provider — the
 * classifier's `shouldFallback` verdict (rate_limit, overloaded, server_error,
 * timeout, network, billing, model_not_found). Replaces the old coarse
 * retryable regex with a typed decision.
 */
function isTransientError(err: unknown): boolean {
  if (isPoolExhaustion(err)) return true;
  return classifyProviderError(err).shouldFallback;
}

function isPoolExhaustion(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "poolExhausted" in err && (err as { poolExhausted?: unknown }).poolExhausted === true);
}

// ---------------------------------------------------------------------------
// stream() helpers — extracted to keep FallbackChain.stream() complexity ≤10
// ---------------------------------------------------------------------------

type TryResult<T> =
  | { done: true; value: T; err?: never; transient?: never }
  | { done: false; value?: never; err: unknown; transient: boolean };

async function tryComplete(
  provider: LLMProvider,
  messages: Message[],
  tools: ToolSchema[],
  config?: CompletionConfig,
): Promise<TryResult<CompletionResult>> {
  try {
    return { done: true, value: await provider.complete(messages, tools, config) };
  } catch (err) {
    return { done: false, err, transient: isTransientError(err) && !isAuthError(err) };
  }
}

/** Yields stream chunks; returns `{done:true}` on success, `{done:false}` on pre-yield error. */
async function* tryStream(
  streamFn: NonNullable<LLMProvider["stream"]>,
  messages: Message[],
  tools: ToolSchema[],
  config?: CompletionConfig,
): AsyncGenerator<StreamChunk, TryResult<void>> {
  let yielded = false;
  try {
    for await (const chunk of streamFn(messages, tools, config)) {
      yielded = true;
      yield chunk;
    }
    return { done: true, value: undefined };
  } catch (err) {
    if (yielded) throw err; // mid-stream: can't recover cleanly
    return { done: false, err, transient: isTransientError(err) && !isAuthError(err) };
  }
}

/**
 * Wraps an ordered list of providers. On a transient failure, the chain
 * automatically falls through to the next provider. Non-transient or auth
 * failures propagate immediately. On exhaust (all failed transiently), the
 * last error is re-thrown.
 */
export class FallbackChain implements LLMProvider {
  constructor(private readonly providers: LLMProvider[]) {
    if (providers.length === 0) throw new Error("FallbackChain requires at least one provider");
  }

  modelId(): string {
    return this.providers[0]!.modelId();
  }

  contextWindow(): number {
    return this.providers[0]!.contextWindow();
  }

  async complete(
    messages: Message[],
    tools: ToolSchema[],
    config?: CompletionConfig,
  ): Promise<CompletionResult> {
    let lastErr: unknown;
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i]!;
      try {
        return await provider.complete(messages, tools, config);
      } catch (err) {
        // Auth errors propagate immediately — retrying a bad key won't help.
        if (isAuthError(err)) throw err;
        // Non-transient errors on any provider propagate immediately.
        if (!isTransientError(err)) throw err;
        lastErr = err;
        // If more providers remain, try the next one; else fall through.
      }
    }
    throw lastErr;
  }

  async *stream(
    messages: Message[],
    tools: ToolSchema[],
    config?: CompletionConfig,
  ): AsyncIterable<StreamChunk> {
    let lastErr: unknown;
    for (const provider of this.providers) {
      const streamFn = provider.stream?.bind(provider);
      if (streamFn) {
        const result = yield* tryStream(streamFn, messages, tools, config);
        if (result.done) return;
        if (!result.transient) throw result.err;
        lastErr = result.err;
      } else {
        const result = await tryComplete(provider, messages, tools, config);
        if (result.done) { yield { type: "done", result: result.value! }; return; }
        if (!result.transient) throw result.err;
        lastErr = result.err;
      }
    }
    throw lastErr;
  }
}

/**
 * Build a fallback chain from the primary provider and the environment.
 *
 * `VANTA_FALLBACK_PROVIDERS` — comma-separated provider ids to try after the
 * primary (e.g. `ollama,anthropic`). Ids that fail to resolve (missing key,
 * unknown id) are skipped silently. If no valid fallbacks are found, or the
 * env var is not set, the primary is returned unchanged (no wrapping overhead).
 */
export function buildFallbackChain(
  primary: LLMProvider,
  env: NodeJS.ProcessEnv,
): LLMProvider {
  const raw = env.VANTA_FALLBACK_PROVIDERS;
  if (!raw?.trim()) return primary;

  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return primary;

  const fallbacks: LLMProvider[] = [];
  for (const id of ids) {
    try {
      // resolveProvider reads VANTA_PROVIDER; override it for each fallback id.
      const resolved = resolveProvider({ ...env, VANTA_PROVIDER: id });
      fallbacks.push(resolved);
    } catch {
      // Missing key or unknown id — skip silently.
    }
  }

  if (fallbacks.length === 0) return primary;
  return new FallbackChain([primary, ...fallbacks]);
}
