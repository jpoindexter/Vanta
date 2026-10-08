import { afterEach, describe, expect, it, vi } from "vitest";
import { capabilitySnapshot, CAPABILITY_START, formatCapabilitySnapshot, injectCapabilitySnapshot, providerCapabilityState, recordCapabilityProviderResult } from "./capability-snapshot.js";
import { getCompletion, getCompletionWithContextRetry } from "./provider-call.js";
import { isPlanBlocked } from "./plan-gate.js";
import { buildRegistry, InMemoryToolRegistry } from "../tools/index.js";
import { buildSystemPrompt, splitStableVolatile } from "../prompt.js";
import { workflowViews } from "../repl/what-can-i-do-cmd.js";
import type { AgentDeps } from "./agent-types.js";
import type { Message } from "../types.js";
import type { ToolSchema } from "../providers/interface.js";

const schema = (name: string): ToolSchema => ({ name, description: `${name} route`, parameters: {} });
afterEach(() => vi.unstubAllEnvs());

describe("live capability grounding", () => {
  it("preserves stable instructions byte-for-byte while catalogs change", async () => {
    const options = { root: "/tmp/vanta-capability", soulPath: "/nonexistent", goals: [], now: "2026-10-08", loadContext: false };
    const first = splitStableVolatile(await buildSystemPrompt({ ...options, tools: [schema("read_file")] }));
    const second = splitStableVolatile(await buildSystemPrompt({ ...options, tools: [schema("browser_act")] }));
    expect(first.stable).toBe(second.stable);
    expect(first.volatile).toContain("read_file route");
    expect(second.volatile).toContain("browser_act route");
    expect(first.stable).not.toContain("you CAN, and you have the tools");
    const refreshed = injectCapabilitySnapshot([{ role: "system", content: first.stable }], capabilitySnapshot([schema("read_file")]));
    expect(splitStableVolatile(refreshed[0]!.content).stable).toBe(first.stable);
    expect(splitStableVolatile(refreshed[0]!.content).volatile).toContain(CAPABILITY_START);
  });

  it.each(["default", "acceptEdits", "auto", "fullAccess"] as const)("%s exposes registered tools without claiming approval", (mode) => {
    const tools = [schema("read_file"), schema("write_file")];
    const snapshot = capabilitySnapshot(tools, tools, { mode });
    expect(snapshot.exposed).toEqual(tools);
    expect(formatCapabilitySnapshot(snapshot)).toContain("Tool presence never grants permission");
  });

  it("plan mode and the workflow surface agree with the dispatch gate", () => {
    const tools = ["read_file", "edit_file", "grep_files", "shell_cmd", "write_file"].map(schema);
    const snapshot = capabilitySnapshot(tools, tools, { planActive: true });
    expect(snapshot.exposed.map((tool) => tool.name)).toEqual(["read_file", "edit_file", "grep_files"]);
    expect(snapshot.blocked).toEqual(["shell_cmd", "write_file"]);
    const workflow = workflowViews(tools.map((tool) => tool.name), { planActive: true }).find((item) => item.id === "fix-error");
    expect(workflow?.missing).toEqual(["shell_cmd"]);
    expect(workflow?.state).toBe("Try");
  });

  it("does not invent excluded worker, explicit-empty or disabled-server tools", () => {
    const empty = buildRegistry({ include: [] });
    expect(capabilitySnapshot(empty.schemas()).exposed).toEqual([]);
    const worker = buildRegistry({ include: ["read_file", "delegate"], exclude: ["delegate"] });
    const snapshot = capabilitySnapshot(worker.schemas());
    expect(snapshot.exposed.map((tool) => tool.name)).toEqual(["read_file"]);
    expect(formatCapabilitySnapshot(snapshot)).not.toMatch(/mcp_fixture|delegate route|agent_session/);
  });

  it("distinguishes deferred schemas from missing tools and actual readiness", () => {
    const snapshot = capabilitySnapshot([schema("read_file"), schema("browser_act")], [schema("read_file")]);
    const rendered = formatCapabilitySnapshot(snapshot);
    expect(snapshot.deferred).toEqual(["browser_act"]);
    expect(rendered).toContain("Tool discovery is unavailable");
    expect(rendered).toContain("offline/setup failures");
    expect(rendered).toContain("not certified by tool registration");
  });

  it("provider authentication failure removes runnable agent capabilities", () => {
    const snapshot = capabilitySnapshot([schema("read_file")], undefined, { providerState: "requires_auth" });
    expect(snapshot.exposed).toEqual([]);
    expect(formatCapabilitySnapshot(snapshot)).toContain("repair the selected provider");
    expect(workflowViews(["read_file"], { providerState: "requires_auth" }).every((view) => view.state === "Setup")).toBe(true);
  });

  it("refreshes a changed registry in the actual provider call without editing saved history", async () => {
    const registry = new InMemoryToolRegistry();
    const register = (name: string) => registry.register({ schema: schema(name), execute: async () => ({ ok: true, output: "read" }) });
    register("read_file");
    const captured: { messages: Message[]; tools: ToolSchema[] }[] = [];
    let plan = false;
    const deps = {
      registry, planGate: () => plan, root: "/tmp/vanta-capability",
      provider: { complete: async (messages: Message[], tools: ToolSchema[]) => {
        captured.push({ messages, tools });
        return { text: "Captured", toolCalls: [], finishReason: "stop" };
      } },
    } as unknown as AgentDeps;
    const messages: Message[] = injectCapabilitySnapshot([{ role: "system", content: "Stable instructions" }, { role: "user", content: "all tools" }], capabilitySnapshot(registry.schemas()));
    await getCompletion(deps, messages);
    register("mcp_fixture_read");
    register("write_file");
    plan = true;
    await getCompletion(deps, messages);
    expect(captured[0]!.tools.map((tool) => tool.name)).toEqual(["read_file"]);
    expect(captured[1]!.tools.map((tool) => tool.name)).toEqual(["read_file"]);
    expect(captured[1]!.messages[0]!.content).toContain("Blocked by plan mode: mcp_fixture_read, write_file");
    plan = false;
    await getCompletion(deps, messages);
    expect(captured[2]!.tools.map((tool) => tool.name)).toEqual(["read_file", "mcp_fixture_read", "write_file"]);
    expect(captured[2]!.messages[0]!.content.split(CAPABILITY_START)).toHaveLength(2);
    expect(messages[0]!.content).not.toContain("mcp_fixture_read");
  });

  it("checks every tool subset for invented/omitted schemas in all five modes", () => {
    const names = ["read_file", "write_file", "web_fetch", "tool_search", "delegate", "mcp_fixture_read", "shell_cmd"];
    for (let mask = 0; mask < 128; mask++) {
      const tools = names.filter((_, index) => (mask & (1 << index)) !== 0).map(schema);
      for (const mode of ["default", "plan", "acceptEdits", "auto", "fullAccess"] as const) {
        const expected = tools.filter((tool) => !isPlanBlocked(tool.name, () => mode === "plan")).map((tool) => tool.name);
        const snapshot = capabilitySnapshot(tools, [...tools, schema("invented_tool")], { mode });
        const rendered = formatCapabilitySnapshot(snapshot);
        expect(snapshot.exposed.map((tool) => tool.name)).toEqual(expected);
        expect([...rendered.matchAll(/^- (\w+):/gm)].map((match) => match[1])).toEqual(expected);
        expect(rendered).not.toContain("invented_tool");
      }
    }
  });

  it("an explicit host mode or plan approval supersedes stale startup Plan", () => {
    vi.stubEnv("VANTA_OPERATING_MODE", "plan");
    expect(capabilitySnapshot([schema("write_file")], undefined, { mode: "auto" }).exposed).toHaveLength(1);
    expect(capabilitySnapshot([schema("write_file")], undefined, { planActive: false }).exposed).toHaveLength(1);
    expect(capabilitySnapshot([schema("write_file")]).exposed).toEqual([]);
  });

  it("bounded provider retry retains eligible schemas and clears only its own failure", async () => {
    vi.stubEnv("VANTA_PROVIDER_RETRIES", "1");
    vi.stubEnv("VANTA_PROVIDER_RETRY_BACKOFF_MS", "0");
    const tools = [schema("read_file")];
    const captured: { messages: Message[]; tools: ToolSchema[] }[] = [];
    const otherProvider = {};
    recordCapabilityProviderResult(otherProvider, new Error("401 invalid API key"));
    const provider = { complete: async (messages: Message[], schemas: ToolSchema[]) => {
      captured.push({ messages, tools: schemas });
      if (captured.length === 1) throw new Error("ECONNRESET");
      return { text: "recovered", toolCalls: [], finishReason: "stop" as const };
    } };
    const deps = { provider, registry: { schemas: () => tools } } as unknown as AgentDeps;
    const result = await getCompletionWithContextRetry({ deps, depsWithTools: { ...deps, currentTools: tools },
      messages: [{ role: "user", content: "read" }], turnCtx: {} as never,
      providerCall: { ctx: {} as never, prefetched: new Map(), schemas: tools } });
    expect(result.ok).toBe(true);
    expect(captured.map((call) => call.tools)).toEqual([tools, tools]);
    expect(captured[1]!.messages[0]!.content).toContain("recovery attempt after offline");
    expect(providerCapabilityState(provider)).toBe("unverified");
    expect(providerCapabilityState(otherProvider)).toBe("requires_auth");
  });
});
