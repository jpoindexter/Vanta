import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { recordProviderCall } from "../cost/route-ledger.js";
import { recordRuntimeResourceUsage } from "../cost/runtime-resource-capture.js";
import type { ProviderRoute } from "../providers/interface.js";
import { getCompletionWithContextRetry, type CompletionRetryArgs } from "./provider-call.js";
import type { AgentDeps } from "./agent-types.js";

type UsageOwner = NonNullable<AgentDeps["providerUsage"]>;
type ResourceInput = { deps: AgentDeps; owner: UsageOwner; callId: string; started: number; route: ProviderRoute };

function usageOwner(deps: AgentDeps): UsageOwner | null {
  if (deps.providerUsage) return { ...deps.providerUsage };
  if (!deps.sessionId && !deps.usageAgent) return null;
  return { root: deps.root, sessionId: deps.sessionId ?? "one-shot", taskId: deps.usageTaskId, agent: deps.usageAgent ?? "agent" };
}

function fallbackRoute(deps: AgentDeps): ProviderRoute {
  return deps.provider.routeInfo?.() ?? { provider: "unknown", model: deps.provider.modelId(), baseRoute: "provider://unknown", billingMode: "unknown" };
}

function resourceInput({ deps, owner, callId, started, route }: ResourceInput) {
  return {
    callId, sessionId: owner.sessionId, taskId: owner.taskId, agent: owner.agent,
    route, requestLatencyMs: Date.now() - started, contextWindowTokens: deps.provider.contextWindow(),
  };
}

async function recordFailure(input: Omit<ResourceInput, "route" | "owner"> & { owner: UsageOwner | null }): Promise<void> {
  if (!input.owner) return;
  await recordRuntimeResourceUsage(input.owner.root, { ...resourceInput({ ...input, owner: input.owner, route: fallbackRoute(input.deps) }), failureClass: "provider_call_failed" });
}

export async function completeAndRecordUsage(args: CompletionRetryArgs) {
  const callId = randomUUID();
  const started = Date.now();
  const owner = usageOwner(args.deps);
  let completion: Awaited<ReturnType<typeof getCompletionWithContextRetry>>;
  try { completion = await getCompletionWithContextRetry(args); }
  catch (error) { await recordFailure({ deps: args.deps, owner, callId, started }); throw error; }
  if (!completion.ok) { await recordFailure({ deps: args.deps, owner, callId, started }); return completion; }
  if (!owner) return completion;
  const route = completion.result.servedRoute ?? fallbackRoute(args.deps);
  await recordProviderCall(join(owner.root, ".vanta"), {
    callId, sessionId: owner.sessionId, agent: owner.agent, purpose: "main", route, usage: completion.result.usage,
  });
  await recordRuntimeResourceUsage(owner.root, { ...resourceInput({ deps: args.deps, owner, callId, started, route }), usage: completion.result.usage });
  return completion;
}
