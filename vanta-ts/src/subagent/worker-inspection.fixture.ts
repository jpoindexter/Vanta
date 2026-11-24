// Owned two-process crash fixture. Never loads a real provider, tool or kernel.
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSubagent } from "./spawn.js";
import { beginAsyncResult } from "./async-delegate.js";
import { inspectWorker } from "./worker-inspection.js";
import { runAgentsCommand } from "../cli/agents-cmd.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "../agent.js";
import type { CompletionResult } from "../providers/interface.js";

const [mode, root] = process.argv.slice(2);
const id = "restart-child";
if (!root || !["worker", "worker-text", "inspect"].includes(mode ?? "")) throw new Error("Explicit fixture mode and root required");
if (mode === "inspect") {
  const logs: string[] = [];
  const code = await runAgentsCommand(root, ["delegation", "inspect", id], { env: process.env, log: line => logs.push(line) });
  const inspection = await inspectWorker(root, id);
  process.send?.({ code, logs, inspection });
} else {
  await beginAsyncResult(join(root, ".vanta"), id);
  const registry = new InMemoryToolRegistry();
  registry.register({ schema: { name: "read_file", description: "Synthetic read only", parameters: {} },
    execute: async () => {
      await appendFile(join(root, "calls.jsonl"), "tool\n");
      return { ok: true, output: "Synthetic partial research", effectDisposition: "none" };
    } });
  let calls = 0;
  const provider = {
    modelId: () => "synthetic-offline", contextWindow: () => 100_000,
    complete: async (): Promise<CompletionResult> => {
      calls++;
      await appendFile(join(root, "calls.jsonl"), "model\n");
      const checkpoint = await inspectWorker(root, id);
      if (!checkpoint || !checkpoint.record.messages.some(message => message.role === "user")) throw new Error("Initial checkpoint missing before provider");
      if (checkpoint.record.iterationsReserved !== calls) throw new Error("Loop reservation missing before provider");
      if (calls === 1) return mode === "worker-text"
        ? { text: "", toolCalls: [], finishReason: "stop" }
        : { text: "Research in progress", toolCalls: [{ id: "read-once", name: "read_file", arguments: {} }], finishReason: "tool_calls" };
      const expected = mode === "worker-text"
        ? checkpoint.record.messages.some(message => message.role === "user" && message.content.startsWith("You returned nothing"))
        : checkpoint.record.messages.some(message => message.role === "tool" && message.content === "Synthetic partial research");
      if (!expected) throw new Error("Partial checkpoint missing before next provider");
      process.send?.({ ready: true, checkpoint: checkpoint.record.sequence });
      // A real pending operation, deliberately interrupted by this fixture's owner.
      await new Promise(() => { setInterval(() => {}, 60_000); });
      throw new Error("unreachable");
    },
  };
  const deps: AgentDeps = { root, provider, registry, requestApproval: async () => false,
    safety: { assess: async () => ({ risk: "allow", reason: "Synthetic fixture" }), logEvent: async () => {} } as unknown as AgentDeps["safety"] };
  await spawnSubagent({ goal: "Read-only fixture research", instruction: "Read the synthetic fixture once", deps,
    checkSpawn: async () => ({ allowed: true, reason: "Synthetic fixture", depth: 1, maxDepth: 6 }),
    inspection: { id, custodyId: id, root, workerRoot: root, parentSessionId: "fixture-parent" }, maxIterations: 3 });
}
// Flush IPC without keeping an inspector alive.
if (process.connected) process.disconnect();
