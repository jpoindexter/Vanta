// FORK-PROVIDER: the provider a post-turn background fork (skill review, session
// memory, fact extraction, dialectic, brain learn, critic, completion verifier)
// calls. Two jobs, both additive:
//   1. Routing: VANTA_MODEL_LEARN / VANTA_LEARN_PROVIDER (routing/aux-map.ts) send
//      the fork to a cheaper model. Unset, the fork uses the main provider.
//   2. Attribution: every fork call is written to the route ledger with its
//      purpose, so fork spend is visible next to main-turn spend.
// A bad override never breaks a turn: it warns once and the call runs on the main
// provider (never on some other paid provider).

import { randomUUID } from "node:crypto";
import { recordProviderCall, type RoutePurpose } from "../cost/route-ledger.js";
import type { CompletionConfig, CompletionResult, LLMProvider, ProviderRoute, ToolSchema } from "../providers/interface.js";
import type { Message } from "../types.js";
import { auxEnvNames, hasAuxOverride, resolveAuxProvider } from "./aux-map.js";

export type ForkLedger = { dataDir: string; sessionId: string; agent: string };
export type ForkPurpose = Extract<RoutePurpose, "learn" | "verify">;

export type ForkProviderOpts = {
  purpose: ForkPurpose;
  env?: NodeJS.ProcessEnv;
  /** Where to record each fork call; omitted = route only, nothing recorded. */
  ledger?: ForkLedger;
  /** Warning sink; the default prints each distinct line once per process. */
  warn?: (line: string) => void;
  /** Builds the routed provider from env; defaults to the aux-map ladder. Injectable for tests. */
  resolveRouted?: (env: NodeJS.ProcessEnv) => LLMProvider;
};

const warned = new Set<string>();

function warnOnce(line: string): void {
  if (warned.has(line)) return;
  warned.add(line);
  console.warn(line);
}

function reasonOf(err: unknown): string {
  const first = (err instanceof Error ? err.message : String(err)).split("\n")[0] ?? "";
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
}

function overrideValue(env: NodeJS.ProcessEnv): string {
  const names = auxEnvNames("learn");
  return [env[names.model] && `${names.model}=${env[names.model]}`, env[names.provider] && `${names.provider}=${env[names.provider]}`]
    .filter(Boolean).join(" ");
}

function fallbackNotice(main: LLMProvider, env: NodeJS.ProcessEnv, err: unknown): string {
  const names = auxEnvNames("learn");
  return `vanta: ${overrideValue(env)} failed (${reasonOf(err)}); background forks run on ${main.modelId()} instead. Fix or unset ${names.model}/${names.provider}.`;
}

function routeOf(provider: LLMProvider): ProviderRoute {
  return provider.routeInfo?.() ?? { provider: "unknown", model: provider.modelId(), baseRoute: "provider://unknown", billingMode: "unknown" };
}

/** Lazily resolve the routed provider; a bad override warns and yields the main provider. */
function lazyTarget(main: LLMProvider, env: NodeJS.ProcessEnv, opts: ForkProviderOpts): () => LLMProvider {
  const warn = opts.warn ?? warnOnce;
  const build = opts.resolveRouted ?? ((e: NodeJS.ProcessEnv) => resolveAuxProvider("learn", e));
  let target: LLMProvider | undefined;
  return () => {
    if (target) return target;
    try { target = build(env); }
    catch (err) { warn(fallbackNotice(main, env, err)); target = main; }
    return target;
  };
}

async function recordFork(opts: ForkProviderOpts, used: LLMProvider, result: CompletionResult, fallbackDepth?: number): Promise<void> {
  if (!opts.ledger) return;
  const base = result.servedRoute ?? routeOf(used);
  const route = fallbackDepth ? { ...base, fallbackDepth } : base;
  await recordProviderCall(opts.ledger.dataDir, { callId: randomUUID(), ...opts.ledger, purpose: opts.purpose, route, usage: result.usage });
}

/** Build the provider a background fork should call. Pure and cheap: nothing is resolved until the fork first uses it. */
export function forkProvider(main: LLMProvider, opts: ForkProviderOpts): LLMProvider {
  const env = opts.env ?? process.env;
  const routed = hasAuxOverride("learn", env);
  if (!routed && !opts.ledger) return main;
  const warn = opts.warn ?? warnOnce;
  const resolve = routed ? lazyTarget(main, env, opts) : () => main;
  return {
    modelId: () => resolve().modelId(),
    contextWindow: () => resolve().contextWindow(),
    routeInfo: () => routeOf(resolve()),
    countTokens: async (messages, tools) => {
      const target = resolve();
      if (!target.countTokens) throw new Error("token counting unavailable on this fork provider");
      return target.countTokens(messages, tools);
    },
    async complete(messages: Message[], tools: ToolSchema[], config?: CompletionConfig): Promise<CompletionResult> {
      const used = resolve();
      let served = used;
      let result: CompletionResult;
      let depth: number | undefined;
      try {
        result = await used.complete(messages, tools, config);
      } catch (err) {
        if (used === main || config?.signal?.aborted) throw err;
        warn(fallbackNotice(main, env, err));
        served = main;
        depth = 1;
        result = await main.complete(messages, tools, config);
      }
      await recordFork(opts, served, result, depth);
      return result;
    },
  };
}
