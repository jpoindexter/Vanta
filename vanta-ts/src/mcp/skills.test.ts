import { describe, it, expect, vi } from "vitest";
import type { McpPromptDef } from "./client.js";
import type { Verdict } from "../types.js";
import {
  skillCommandName,
  buildPromptArgs,
  mcpPromptToSkillCommand,
  fetchMcpSkillsForClient,
  type SkillClient,
} from "./skills.js";

// Pure mapping tested against a MOCKED MCP client — no process spawn, no kernel.

const allow: Verdict = { risk: "allow", needsHuman: false, reason: "ok" };
const block: Verdict = { risk: "block", needsHuman: false, reason: "destructive" };
const ask: Verdict = { risk: "ask", needsHuman: true, reason: "out of scope" };

function mockClient(over: Partial<SkillClient> = {}): SkillClient {
  return {
    listPrompts: vi.fn(async () => []),
    getPrompt: vi.fn(async () => "rendered"),
    ...over,
  } as SkillClient;
}

const summarize: McpPromptDef = {
  name: "Summarize Doc",
  description: "summarize a document",
  arguments: [{ name: "url", required: true }],
};

describe("skillCommandName", () => {
  it("slugifies server + prompt into a registry-safe lowercase hyphenated name", () => {
    expect(skillCommandName("Docs Server", "Summarize Doc")).toBe("mcp-docs-server-summarize-doc");
  });
  it("collapses characters outside [a-z0-9-] and trims trailing hyphens", () => {
    expect(skillCommandName("api.v2", "do/it!")).toBe("mcp-api-v2-do-it");
  });
  it("produces a name the PluginCommandRegistry accepts (no underscores)", () => {
    expect(skillCommandName("docs", "summarize")).toMatch(/^[a-z][a-z0-9-]{0,63}$/);
  });
});

describe("buildPromptArgs", () => {
  it("maps the slash arg to the first declared prompt argument", () => {
    expect(buildPromptArgs(summarize, "http://x")).toEqual({ url: "http://x" });
  });
  it("is empty when the prompt declares no arguments", () => {
    expect(buildPromptArgs({ name: "p" }, "ignored")).toEqual({});
  });
  it("is empty when no arg text is supplied", () => {
    expect(buildPromptArgs(summarize, "   ")).toEqual({});
  });
});

describe("mcpPromptToSkillCommand — descriptor shape", () => {
  it("derives name, arg hint, description, and server provenance", () => {
    const d = mcpPromptToSkillCommand(mockClient(), "docs", summarize);
    expect(d.name).toBe("mcp-docs-summarize-doc");
    expect(d.arg).toBe("<url>");
    expect(d.description).toBe("summarize a document");
    expect(d.server).toBe("docs");
  });
  it("falls back to a synthesized description and undefined arg with no declared args", () => {
    const d = mcpPromptToSkillCommand(mockClient(), "docs", { name: "ping" });
    expect(d.description).toContain("ping");
    expect(d.arg).toBeUndefined();
  });
});

describe("mcpPromptToSkillCommand — kernel-gated invoke", () => {
  it("renders via getPrompt when the kernel allows", async () => {
    const client = mockClient({ getPrompt: vi.fn(async () => "the rendered prompt") });
    const d = mcpPromptToSkillCommand(client, "docs", summarize);
    const res = await d.invoke("http://x", async () => allow);
    expect(res).toEqual({ ok: true, output: "the rendered prompt" });
    expect(client.getPrompt).toHaveBeenCalledWith("Summarize Doc", { url: "http://x" });
  });

  it("refuses (and does not call getPrompt) when the kernel blocks", async () => {
    const client = mockClient();
    const d = mcpPromptToSkillCommand(client, "docs", summarize);
    const res = await d.invoke("x", async () => block);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("blocked by kernel");
    expect(client.getPrompt).not.toHaveBeenCalled();
  });

  it("refuses headlessly on an ask verdict (no human approval channel)", async () => {
    const client = mockClient();
    const d = mcpPromptToSkillCommand(client, "docs", summarize);
    const res = await d.invoke("x", async () => ask);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("requires approval");
    expect(client.getPrompt).not.toHaveBeenCalled();
  });

  it("returns an error value when the kernel is unreachable", async () => {
    const d = mcpPromptToSkillCommand(mockClient(), "docs", summarize);
    const res = await d.invoke("x", async () => { throw new Error("ECONNREFUSED"); });
    expect(res.ok).toBe(false);
    expect(res.output).toContain("kernel unreachable");
  });

  it("returns an error value when getPrompt throws (never throws across the boundary)", async () => {
    const client = mockClient({ getPrompt: vi.fn(async () => { throw new Error("boom"); }) });
    const d = mcpPromptToSkillCommand(client, "docs", summarize);
    const res = await d.invoke("x", async () => allow);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("skill failed");
  });

  it("substitutes a placeholder for empty rendered output", async () => {
    const client = mockClient({ getPrompt: vi.fn(async () => "") });
    const d = mcpPromptToSkillCommand(client, "docs", summarize);
    const res = await d.invoke("x", async () => allow);
    expect(res).toEqual({ ok: true, output: "(empty skill output)" });
  });
});

describe("fetchMcpSkillsForClient", () => {
  it("maps every declared prompt to a descriptor", async () => {
    const client = mockClient({
      listPrompts: vi.fn(async () => [summarize, { name: "explain" }]),
    });
    const skills = await fetchMcpSkillsForClient(client, "docs");
    expect(skills.map((s) => s.name)).toEqual(["mcp-docs-summarize-doc", "mcp-docs-explain"]);
  });

  it("yields an empty list when listPrompts rejects (server lacks the prompts capability)", async () => {
    const client = mockClient({ listPrompts: vi.fn(async () => { throw new Error("method not found"); }) });
    expect(await fetchMcpSkillsForClient(client, "docs")).toEqual([]);
  });
});
