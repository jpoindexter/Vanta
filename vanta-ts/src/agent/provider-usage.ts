import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { recordProviderCall } from "../cost/route-ledger.js";
import { recordRuntimeResourceUsage } from "../cost/runtime-resource-capture.js";
import type { ProviderRoute } from "../providers/interface.js";
import { getCompletionWithContextRetry, type CompletionRetryArgs } from "./provider-call.js";
import type { AgentDeps } from "./agent-types.js";

function fallbackRoute(deps: AgentDeps): ProviderRoute {
  return deps.provider.routeInfo?.() ?? { provider: "unknown", model: deps.provider.modelId(), baseRoute: "provider://unknown", billingMode: "unknown" };
}

function resourceInput(deps: AgentDeps, callId: string, started: number, route: ProviderRoute) {
  return {
    callId, sessionId: deps.sessionId ?? "one-shot", taskId: deps.usageTaskId, agent: deps.usageAgent ?? "agent",
    route, requestLatencyMs: Date.now() - started, contextWindowTokens: deps.provider.contextWindow(),
  };
}

async function recordFailure(deps: AgentDeps, callId: string, started: number): Promise<void> {
  if (!deps.sessionId && !deps.usageAgent) return;
  await recordRuntimeResourceUsage(deps.root, { ...resourceInput(deps, callId, started, fallbackRoute(deps)), failureClass: "provider_call_failed" });
}

export async function completeAndRecordUsage(args: CompletionRetryArgs) {
  const callId = randomUUID();
  const started = Date.now();
  let completion: Awaited<ReturnType<typeof getCompletionWithContextRetry>>;
  try { completion = await getCompletionWithContextRetry(args); }
  catch (error) { await recordFailure(args.deps, callId, started); throw error; }
  if (!completion.ok) { await recordFailure(args.deps, callId, started); return completion; }
  if (!args.deps.sessionId && !args.deps.usageAgent) return completion;
  const route = completion.result.servedRoute ?? fallbackRoute(args.deps);
  await recordProviderCall(join(args.deps.root, ".vanta"), {
    callId, sessionId: args.deps.sessionId ?? "one-shot", agent: args.deps.usageAgent ?? "agent", route, usage: completion.result.usage,
  });
  await recordRuntimeResourceUsage(args.deps.root, { ...resourceInput(args.deps, callId, started, route), usage: completion.result.usage });
  return completion;
}
