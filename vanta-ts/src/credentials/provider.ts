import type { CompletionConfig, CompletionResult, LLMProvider, StreamChunk, ToolSchema } from "../providers/interface.js";
import type { Message } from "../types.js";
import type { CredentialLease } from "./pool.js";
import { classifyProviderError } from "../providers/error-taxonomy.js";

export type PoolProviderDeps = {
  providerId: string;
  owner: string;
  lease: () => Promise<CredentialLease | null>;
  resolve: (lease: CredentialLease) => Promise<string | null>;
  makeProvider: (credential: string) => LLMProvider;
  failure: (leaseId: string, error: unknown) => Promise<void>;
  release: (leaseId: string) => Promise<void>;
};

export class CredentialPoolExhaustedError extends Error {
  readonly poolExhausted = true;
  constructor(providerId: string, options?: ErrorOptions) {
    super(`credential pool exhausted for ${providerId}`, options);
    this.name = "CredentialPoolExhaustedError";
  }
}

function isCredentialFailure(error: unknown): boolean {
  return ["rate_limit", "billing", "auth", "auth_permanent"].includes(classifyProviderError(error).reason);
}

export class CredentialPoolProvider implements LLMProvider {
  constructor(private readonly base: LLMProvider, private readonly deps: PoolProviderDeps) {}
  modelId(): string { return this.base.modelId(); }
  contextWindow(): number { return this.base.contextWindow(); }

  async complete(messages: Message[], tools: ToolSchema[], config?: CompletionConfig): Promise<CompletionResult> {
    let usedPool = false, lastError: unknown;
    while (true) {
      const lease = await this.deps.lease();
      if (!lease) break;
      usedPool = true;
      const credential = await this.deps.resolve(lease);
      if (!credential) { await this.deps.failure(lease.leaseId, new Error("credential reference unavailable")); continue; }
      try {
        const result = await this.deps.makeProvider(credential).complete(messages, tools, config);
        await this.deps.release(lease.leaseId);
        return result;
      } catch (error) {
        if (!isCredentialFailure(error)) { await this.deps.release(lease.leaseId); throw error; }
        lastError = error;
        await this.deps.failure(lease.leaseId, error);
      }
    }
    try { return await this.base.complete(messages, tools, config); }
    catch (error) {
      if (usedPool && isCredentialFailure(error)) throw new CredentialPoolExhaustedError(this.deps.providerId, { cause: lastError ?? error });
      throw error;
    }
  }

  async *stream(messages: Message[], tools: ToolSchema[], config?: CompletionConfig): AsyncIterable<StreamChunk> {
    const pooled = yield* streamPoolAttempts(this.deps, messages, tools, config);
    if (pooled.served) return;
    const result = yield* tryProviderStream(this.base, messages, tools, config);
    if (result.ok) return;
    if (pooled.used && !result.yielded && isCredentialFailure(result.error)) throw new CredentialPoolExhaustedError(this.deps.providerId, { cause: pooled.lastError ?? result.error });
    throw result.error;
  }
}

type StreamAttempt = { ok: true } | { ok: false; error: unknown; yielded: boolean };
type PoolStreamResult = { served: true; used: true; lastError?: never } | { served: false; used: boolean; lastError?: unknown };

async function* streamPoolAttempts(deps: PoolProviderDeps, messages: Message[], tools: ToolSchema[], config?: CompletionConfig): AsyncGenerator<StreamChunk, PoolStreamResult> {
  let used = false, lastError: unknown;
  while (true) {
    const lease = await deps.lease();
    if (!lease) return { served: false, used, lastError };
    used = true;
    const credential = await deps.resolve(lease);
    if (!credential) { await deps.failure(lease.leaseId, new Error("credential reference unavailable")); continue; }
    const result = yield* tryProviderStream(deps.makeProvider(credential), messages, tools, config);
    if (result.ok) { await deps.release(lease.leaseId); return { served: true, used: true }; }
    if (result.yielded || !isCredentialFailure(result.error)) { await deps.release(lease.leaseId); throw result.error; }
    lastError = result.error;
    await deps.failure(lease.leaseId, result.error);
  }
}

async function* tryProviderStream(provider: LLMProvider, messages: Message[], tools: ToolSchema[], config?: CompletionConfig): AsyncGenerator<StreamChunk, StreamAttempt> {
  let yielded = false;
  try {
    if (!provider.stream) { yield { type: "done", result: await provider.complete(messages, tools, config) }; return { ok: true }; }
    for await (const chunk of provider.stream(messages, tools, config)) { yielded = true; yield chunk; }
    return { ok: true };
  } catch (error) { return { ok: false, error, yielded }; }
}
