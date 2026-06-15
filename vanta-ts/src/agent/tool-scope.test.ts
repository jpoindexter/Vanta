import { describe, it, expect } from "vitest";
import { createConversation } from "../agent.js";
import { ToolRegistry } from "../tools/registry.js";
import type { ToolSchema, LLMProvider, CompletionResult } from "../providers/interface.js";
import type { SafetyClient } from "../safety-client.js";
import { scopeToolSchemas, toolScopeSummary } from "./tool-scope.js";

function schema(name: string, description = `${name} tool`): ToolSchema {
  return { name, description, parameters: { type: "object", properties: {} } };
}

const manySchemas = [
  "tool_search", "clarify", "brain", "recall", "inspect_state", "read_file", "grep_files", "glob_files",
  "web_search", "web_fetch", "git_status", "git_diff", "edit_file", "write_file", "lsp_diagnostics",
  "gmail_send", "calendar_create", "browser_act", "money", "radar", "roadmap_move",
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
});
