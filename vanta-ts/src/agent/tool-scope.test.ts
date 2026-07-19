import { describe, it, expect } from "vitest";
import { createConversation } from "../agent.js";
import { ToolRegistry } from "../tools/registry.js";
import { buildToolSearchTool } from "../tools/tool-search.js";
import type { ToolSchema, LLMProvider, CompletionResult } from "../providers/interface.js";
import type { SafetyClient } from "../safety-client.js";
import { scopeToolSchemas, toolScopeSummary } from "./tool-scope.js";

function schema(name: string, description = `${name} tool`): ToolSchema {
  return { name, description, parameters: { type: "object", properties: {} } };
}

const manySchemas = [
  "tool_search", "clarify", "brain", "recall", "inspect_state", "inspect_context", "read_file", "grep_files", "glob_files",
  "web_search", "web_fetch", "git_status", "git_diff", "edit_file", "write_file", "shell_cmd", "lsp_diagnostics",
  "gmail_send", "calendar_create", "browser_act", "money", "radar", "roadmap_status", "roadmap_move", "call_agent", "delegate",
  "compose_workflow", "protect", "brief",
].map((name) => schema(name));

const fakeSafety = {
  assess: async () => ({ risk: "allow" as const, needsHuman: false, reason: "" }),
  logEvent: async () => {},
} as unknown as SafetyClient;

describe("per-task tool scoping", () => {
  it("exposes a smaller task-relevant subset while keeping tool_search reachable", () => {
    const scoped = scopeToolSchemas(manySchemas, "fix the failing TypeScript test and commit it");
    const names = scoped.map((s) => s.name);
    expect(scoped.length).toBeLessThan(manySchemas.length);
    expect(names).toEqual(expect.arrayContaining(["tool_search", "read_file", "grep_files", "git_status", "git_diff", "lsp_diagnostics"]));
    expect(names).not.toContain("gmail_send");
    expect(toolScopeSummary(manySchemas, scoped)).toContain("reduction");
  });

  it("always keeps the action primitives (write_file/edit_file/shell_cmd) in scope, even for a non-code request", () => {
    const scoped = scopeToolSchemas(manySchemas, "send an email to bob about the meeting").map((s) => s.name);
    for (const core of ["read_file", "write_file", "edit_file", "shell_cmd"]) {
      expect(scoped).toContain(core); // never hidden behind tool_search
    }
  });

  it("keeps call_agent callable when the user wants to talk to another agent (VANTA-AGENT-ROUTING-DISCOVERY)", () => {
    const scoped = scopeToolSchemas(manySchemas, "talk to claude code about this bug").map((s) => s.name);
    expect(scoped).toContain("call_agent");
    // and not surfaced for an unrelated request
    const emailScope = scopeToolSchemas(manySchemas, "send an email to bob about the meeting").map((s) => s.name);
    expect(emailScope).not.toContain("call_agent");
  });

  it("exposes workflow validation, protection, and review tools for architecture workflows", () => {
    const scoped = scopeToolSchemas(
      manySchemas,
      "Draft a Kubernetes workflow with isolation, scoped secrets, health checks, rollback, and approval before deploy",
    ).map((s) => s.name);
    expect(scoped).toEqual(expect.arrayContaining(["compose_workflow", "protect", "brief"]));
  });

  it("keeps the read-only roadmap tool in scope for roadmap questions", () => {
    const scoped = scopeToolSchemas(manySchemas, "what is left on the roadmap?").map((s) => s.name);
    expect(scoped).toContain("roadmap_status");
  });

  it("returns the full set when the user explicitly asks for all tools", () => {
    const scoped = scopeToolSchemas(manySchemas, "use the full toolset for this");
    expect(scoped.map((s) => s.name)).toEqual(manySchemas.map((s) => s.name));
  });

  it("passes the scoped schema subset to the provider", async () => {
    const registry = new ToolRegistry();
    for (const s of manySchemas) registry.register({ schema: s, execute: async () => ({ ok: true, output: "" }) });
    let seen: string[] = [];
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 100_000,
      async complete(_messages, tools): Promise<CompletionResult> {
        seen = tools.map((t) => t.name);
        return { text: "scoped", toolCalls: [], finishReason: "stop" };
      },
    };
    const convo = createConversation("sys", {
      provider,
      safety: fakeSafety,
      registry,
      root: "/x",
      requestApproval: async () => true,
    });

    await convo.send("fix the failing TypeScript test");

    expect(seen.length).toBeLessThan(manySchemas.length);
    expect(seen).toContain("tool_search");
    expect(seen).toContain("lsp_diagnostics");
  });

  it("exposes a searched tool's full schema on the next provider call", async () => {
    const registry = new ToolRegistry();
    for (const s of manySchemas) registry.register({ schema: s, execute: async () => ({ ok: true, output: "" }) });
    registry.register(buildToolSearchTool(registry));
    const seen: string[][] = [];
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 100_000,
      async complete(_messages, tools): Promise<CompletionResult> {
        seen.push(tools.map((t) => t.name));
        if (seen.length === 1) {
          return {
            text: "",
            finishReason: "tool_calls",
            toolCalls: [{ id: "search-1", name: "tool_search", arguments: { query: "calendar_create", maxResults: 1 } }],
          };
        }
        return { text: "loaded", toolCalls: [], finishReason: "stop" };
      },
    };
    const convo = createConversation("sys", {
      provider,
      safety: fakeSafety,
      registry,
      root: "/x",
      requestApproval: async () => true,
    });

    await convo.send("use a deferred calendar tool");

    expect(seen[0]).not.toContain("calendar_create");
    expect(seen[1]).toContain("calendar_create");
  });
});
