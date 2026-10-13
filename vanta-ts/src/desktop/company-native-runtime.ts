import type { AgentDeps, AgentOutcome } from "../agent.js";
import { estimateCostUsd } from "../pricing.js";
import { providerOverrideEnv } from "../providers/override-env.js";
import type { LLMProvider } from "../providers/interface.js";
import type { RunSetup } from "../session.js";
import { requestWebApproval } from "./approval.js";
import type { RunCost, WorkerRunRequest, WorkerRunResult, WorkerRuntime } from "./company-ports.js";
import { ensureDesktopConversation } from "./handler-conversation.js";
import type { DesktopState } from "./handler-state.js";

// The one worker runtime the engine can really drive: the in-process Vanta
// agent loop (the same spawnSubagent that `team run` and `fleet` use). Unlike
// `team run`, the hired worker's adapter and model are honoured, the result is
// recorded as a work product, and usage and cost come back. The worker cannot
// fan out (delegate and team are removed from its registry) and every tool call
// goes through the kernel and the desktop approval flow.

const WORKER_MAX_ITERATIONS = 20;
export const ARTIFACT_STORE_MAX_CHARS = 8000;

/** Replaceable seams so the adapter is testable without a provider or kernel. */
export type NativeSeams = {
  setup?: (state: DesktopState) => Promise<RunSetup>;
  resolveProvider?: (env: NodeJS.ProcessEnv) => LLMProvider;
  buildRegistry?: () => AgentDeps["registry"];
  spawn?: (opts: { goal: string; instruction: string; deps: AgentDeps; maxIterations: number; signal?: AbortSignal }) => Promise<AgentOutcome>;
};

async function loadSeams(seams: NativeSeams): Promise<Required<NativeSeams>> {
  const [{ resolveProvider }, { buildRegistry }, { spawnSubagent }] = await Promise.all([
    import("../providers/index.js"),
    import("../tools/index.js"),
    import("../subagent/spawn.js"),
  ]);
  return {
    setup: seams.setup ?? (async (state) => (await ensureDesktopConversation(state)).setup),
    resolveProvider: seams.resolveProvider ?? resolveProvider,
    buildRegistry: seams.buildRegistry ?? (() => buildRegistry({ exclude: ["delegate", "team"] })),
    spawn: seams.spawn ?? spawnSubagent,
  };
}

function costOf(model: string, outcome: AgentOutcome): RunCost | undefined {
  const usage = outcome.usage;
  const usd = usage ? estimateCostUsd(model, usage.inputTokens, usage.outputTokens) : null;
  return usd !== null && usd > 0 ? { usd, basis: "estimated" as const } : undefined;
}

async function runNative(state: DesktopState, request: WorkerRunRequest, seams: Required<NativeSeams>): Promise<WorkerRunResult> {
  const setup = await seams.setup(state);
  const env = providerOverrideEnv(request.env, request.worker.adapter, request.worker.model);
  const provider = request.worker.adapter ? seams.resolveProvider(env) : setup.provider;
  request.progress(`started on ${provider.modelId()}`);
  const outcome = await seams.spawn({
    goal: request.task.title,
    instruction: request.instruction,
    maxIterations: WORKER_MAX_ITERATIONS,
    signal: request.signal,
    deps: {
      provider,
      safety: setup.safety,
      registry: seams.buildRegistry(),
      root: state.root,
      requestApproval: (action, reason, toolName, detail) => requestWebApproval(state, action, reason, { toolName, detail }),
      maxIterations: WORKER_MAX_ITERATIONS,
      onToolCall: (name) => request.progress(`tool ${name}`),
    },
  });
  const text = outcome.finalText.trim();
  if (outcome.stoppedReason !== "done") return { ok: false, error: `worker stopped (${outcome.stoppedReason}): ${text.slice(0, 500) || "no output"}` };
  const model = provider.modelId();
  const cost = costOf(model, outcome);
  return {
    ok: true,
    summary: text.slice(0, 500) || "(worker finished with no text)",
    artifacts: text ? [{ artifact: text.slice(0, ARTIFACT_STORE_MAX_CHARS), kind: "report" }] : [],
    ...(outcome.usage ? { usage: outcome.usage } : {}),
    ...(cost ? { cost } : {}),
    model,
    ...(request.worker.adapter ? { provider: request.worker.adapter } : {}),
  };
}

export function createNativeRuntime(state: DesktopState, seams: NativeSeams = {}): WorkerRuntime {
  return {
    id: "vanta-native",
    async run(request) {
      try {
        return await runNative(state, request, await loadSeams(seams));
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
