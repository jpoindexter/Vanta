import type { PlatformAdapter } from "./base.js";
import { MultiChannelAdapter } from "./multi-channel.js";
import { ADAPTERS } from "./adapter-registry.js";

// Messaging adapter factory — the platform analogue of `providers/index.ts`'s
// `resolveProvider`. The registration table (one { configured, build } entry per
// platform) lives in `adapter-registry.js`; this file is the id → instance
// resolution layer. `resolveMessagingAdapter(env)` walks the table in priority
// order and returns the first configured adapter (or undefined — the gateway
// then runs cron/webhook only). `createAdapter(id, env)` builds one by id,
// returning a clear miss for an unknown/unconfigured id.

/** Ids of every platform with a live adapter (registration order). */
export function implementedPlatformIds(): string[] {
  return Object.keys(ADAPTERS);
}

export type CreateAdapterError = { ok: false; error: string };

/**
 * Build one messaging adapter by id from env. Errors-as-values: returns a clear
 * miss when the id has no live adapter, or when the adapter exists but its env
 * isn't configured. Mirrors how `resolveProvider` maps an id → a concrete LLM.
 */
export function createAdapter(
  id: string,
  env: NodeJS.ProcessEnv,
): PlatformAdapter | CreateAdapterError {
  const entry = ADAPTERS[id];
  if (!entry) {
    return {
      ok: false,
      error: `No messaging adapter for "${id}". Implemented: ${implementedPlatformIds().join(", ")}.`,
    };
  }
  if (!entry.configured(env)) {
    return { ok: false, error: `Messaging platform "${id}" is not configured (missing required env).` };
  }
  return entry.build(env);
}

/**
 * Resolve the live messaging adapter for `vanta gateway` from env: the first
 * configured platform in registration order. Returns undefined when nothing is
 * configured — the gateway then runs cron/webhook only.
 */
export function resolveMessagingAdapter(env: NodeJS.ProcessEnv): PlatformAdapter | undefined {
  for (const [id, entry] of Object.entries(ADAPTERS)) {
    if (entry.configured(env)) {
      const built = createAdapter(id, env);
      // configured() just returned true, so build() succeeds; the guard is only
      // a type-narrowing belt to keep the return PlatformAdapter | undefined.
      if (!("ok" in built)) return built;
    }
  }
  return undefined;
}

/** Build EVERY configured messaging adapter (registration order). MSG-MULTICHANNEL-LIVE. */
export function resolveMessagingAdapters(env: NodeJS.ProcessEnv): PlatformAdapter[] {
  const out: PlatformAdapter[] = [];
  for (const [id, entry] of Object.entries(ADAPTERS)) {
    if (!entry.configured(env)) continue;
    const built = createAdapter(id, env);
    if (!("ok" in built)) out.push(built);
  }
  return out;
}

/**
 * The live messaging channel for `vanta gateway`: nothing configured → undefined;
 * one channel → that adapter (un-tagged, back-compat); 2+ → a MultiChannelAdapter
 * that polls all and routes replies back to the originating channel.
 */
export function resolveMessagingChannel(env: NodeJS.ProcessEnv): PlatformAdapter | undefined {
  const all = resolveMessagingAdapters(env);
  if (all.length === 0) return undefined;
  if (all.length === 1) return all[0];
  return new MultiChannelAdapter(all);
}
