import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConversation, type AgentDeps } from "../agent.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { ToolContext } from "../tools/types.js";
import type { LLMProvider } from "../providers/interface.js";
import { dispatchTool } from "./dispatch-tool.js";
import { writeFileTool } from "../tools/write-file.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture(controller: AbortController) {
  const root = await mkdtemp(join(tmpdir(), "vanta-tool-stop-")); roots.push(root);
  vi.stubEnv("VANTA_HOME", root); vi.stubEnv("VANTA_AUTOCONTINUE", "0");
  const first = vi.fn(async (_args: Record<string, unknown>, _ctx: ToolContext) => ({ ok: true, output: "First observed", effectDisposition: "confirmed" as const }));
  const later = vi.fn(async () => ({ ok: true, output: "Later observed", effectDisposition: "confirmed" as const }));
  const registry = new InMemoryToolRegistry();
  for (const [name, execute] of [["write_file", first], ["shell_cmd", later]] as const) registry.register({
    schema: { name, description: "Private fixture", parameters: { type: "object", properties: {} } }, execute,
  });
  const assess = vi.fn(async () => ({ risk: "allow" as const, needsHuman: false, reason: "Private fixture" }));
  const safety = { assess, logEvent: async () => {} } as unknown as AgentDeps["safety"];
  const complete = vi.fn<LLMProvider["complete"]>().mockImplementation(async messages => ({
    text: "Fixture result", finishReason: "stop", toolCalls: messages.at(-1)?.role === "user"
      ? [{ id: "first", name: "write_file", arguments: {} }, { id: "later", name: "shell_cmd", arguments: {} }] : [],
  }));
  const deps: AgentDeps = { root, safety, registry, requestApproval: async () => false,
    provider: { complete, modelId: () => "private-fixture", contextWindow: () => 100000 } };
  const conversation = createConversation("Private Stop fixture", deps);
  return { first, later, assess, complete, deps, conversation,
    run: () => conversation.send("Run private actions", undefined, controller.signal) };
}

it("starts no tool if Stop arrives during its asynchronous safety assessment", async () => {
  const controller = new AbortController(); const f = await fixture(controller);
  f.assess.mockImplementationOnce(async () => { controller.abort(); return { risk: "allow", needsHuman: false, reason: "Private fixture" }; });
  const outcome = await f.run();
  expect(f.first).not.toHaveBeenCalled();
  expect(f.later).not.toHaveBeenCalled();
  expect(f.assess).toHaveBeenCalledOnce();
  expect(outcome.stoppedReason).toBe("interrupted");
});

it("keeps an observed first effect but starts no later call after Stop", async () => {
  const controller = new AbortController(); const f = await fixture(controller);
  f.first.mockImplementationOnce(async () => { controller.abort(); return { ok: true, output: "First observed", effectDisposition: "confirmed" }; });
  const outcome = await f.run();
  expect(f.first).toHaveBeenCalledOnce();
  expect(f.later).not.toHaveBeenCalled();
  expect(f.conversation.messages.filter(message => message.role === "tool").map(message => message.effectDisposition)).toEqual(["confirmed", "none"]);
  expect(outcome.stoppedReason).toBe("interrupted");
});

it("uses each send's signal without retaining a previous turn's cancellation", async () => {
  const controller = new AbortController(); const f = await fixture(controller);
  const seen: Array<AbortSignal | undefined> = [];
  f.first.mockImplementation(async (_args, ctx) => { seen.push(ctx.signal); return { ok: true, output: "First observed", effectDisposition: "confirmed" }; });
  expect((await f.run()).stoppedReason).toBe("done");
  controller.abort();
  const next = new AbortController();
  expect((await f.conversation.send("Run private actions", undefined, next.signal)).stoppedReason).toBe("done");
  expect(seen).toEqual([controller.signal, next.signal]);
});

it("does not replace a real file when an inner approval arrives after Stop", async () => {
  const controller = new AbortController(); const f = await fixture(controller);
  const path = join(f.deps.root, "brief.txt");
  await writeFile(path, "Original bytes");
  f.deps.registry.register(writeFileTool);
  const approve = vi.fn(async () => { controller.abort(); return true; });
  const result = await dispatchTool({ id: "late-inner-approval", name: "write_file", arguments: { path: "brief.txt", content: "Must not replace" } }, f.deps,
    { root: f.deps.root, safety: f.deps.safety, requestApproval: approve, signal: controller.signal });
  expect(approve).toHaveBeenCalledOnce();
  expect(await readFile(path, "utf8")).toBe("Original bytes");
  expect(result.ok).toBe(false);
});
