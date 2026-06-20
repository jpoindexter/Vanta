import { runAcpServer, stdioTransport } from "./acp-server.js";
import type { AgentRunner, RunRequest } from "./session.js";
import type { StreamEvent } from "../agent/agent-types.js";

// `vanta acp serve` entry: build the injected AgentRunner from a real prepareRun
// setup (provider/kernel/registry) and drive the stdio ACP server. The kernel
// stays the boundary — each prompt turn runs a fresh Vanta conversation whose
// gated actions surface as ACP `session/request_permission` via req.approve.

type Setup = {
  systemPrompt: string;
  provider: import("../providers/interface.js").LLMProvider;
  safety: import("../kernel/client.js").KernelClient;
  registry: import("../tools/registry.js").ToolRegistry;
};

/**
 * Build the AgentRunner: one Vanta conversation per ACP prompt turn. The agent's
 * StreamEvents are forwarded as ACP `session/update`s (via req.emit) and gated
 * actions route to the editor's permission UI (via req.approve). A fresh
 * conversation per turn keeps sessions stateless across the ACP boundary in v1.
 */
export function buildAcpRunner(setup: Setup, root: string, buildSummarizer: (p: Setup["provider"]) => unknown): AgentRunner {
  return async (req: RunRequest): Promise<{ stopReason: "end_turn" | "cancelled" | "max_tokens" | "refusal" }> => {
    const { createConversation } = await import("../agent.js");
    const convo = createConversation(setup.systemPrompt, {
      provider: setup.provider,
      safety: setup.safety,
      registry: setup.registry,
      root,
      requestApproval: (action, reason, toolName) => req.approve(action, reason, toolName),
      onEvent: (event: StreamEvent) => req.emit(event),
      summarize: buildSummarizer(setup.provider) as never,
      signal: req.signal,
    });
    const outcome = await convo.send(req.prompt, undefined, req.signal);
    return { stopReason: acpStopReason(outcome.stoppedReason) };
  };
}

/** Map a Vanta StoppedReason to the ACP StopReason vocabulary. */
function acpStopReason(reason: string): "end_turn" | "cancelled" | "max_tokens" | "refusal" {
  if (reason === "interrupted" || reason === "soft_stopped") return "cancelled";
  if (reason === "max_iterations") return "max_tokens";
  if (reason === "repeated_failure") return "refusal";
  return "end_turn";
}

/**
 * `vanta acp serve`: initialize a run setup, then serve ACP over stdio until the
 * editor closes the stream. Returns the process exit code.
 */
export async function runAcpServeCommand(root: string): Promise<number> {
  const { prepareRun, buildSummarizer } = await import("../session.js");
  const setup = await prepareRun(root, "acp session").catch(() => null);
  if (!setup) {
    process.stderr.write("vanta acp serve: failed to initialize\n");
    return 1;
  }
  const runner = buildAcpRunner(setup, root, buildSummarizer);
  await runAcpServer(stdioTransport(), { runner, cwd: root });
  return 0;
}
