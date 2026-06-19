import { describe, it, expect, vi } from "vitest";
import { PluginCommandRegistry } from "../plugins/commands.js";
import type { McpClient, McpPromptDef } from "./client.js";
import type { McpConnection } from "./connect.js";
import type { Verdict } from "../types.js";
import type { ReplCtx } from "../repl/types.js";
import { mcpSkillsEnabled, mountMcpSkills } from "./mount-skills.js";

// Registration/listing tested with INJECTED connections carrying a mocked client
// — no spawn, no live kernel, no real MCP server.

const allow: Verdict = { risk: "allow", needsHuman: false, reason: "ok" };

function fakeClient(prompts: McpPromptDef[], getPrompt = vi.fn(async () => "rendered")): McpClient {
  return {
    listPrompts: vi.fn(async () => prompts),
    getPrompt,
    close: vi.fn(),
  } as unknown as McpClient;
}

function connection(name: string, client?: McpClient, status: McpConnection["status"] = "connected"): McpConnection {
  return { name, transport: "stdio", status, tools: [], client };
}

/** A minimal ReplCtx exposing only the kernel gate the skill handler reads. */
function ctxWith(assess: (a: string) => Promise<Verdict>): ReplCtx {
  return { setup: { safety: { assess } } } as unknown as ReplCtx;
}

const ON = { VANTA_MCP_SKILLS: "1" } as NodeJS.ProcessEnv;

describe("mcpSkillsEnabled", () => {
  it("is off by default", () => {
    expect(mcpSkillsEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });
  it("accepts 1/true/on", () => {
    for (const v of ["1", "true", "on", "ON", "True"]) {
      expect(mcpSkillsEnabled({ VANTA_MCP_SKILLS: v } as NodeJS.ProcessEnv)).toBe(true);
    }
  });
  it("rejects other values", () => {
    expect(mcpSkillsEnabled({ VANTA_MCP_SKILLS: "0" } as NodeJS.ProcessEnv)).toBe(false);
    expect(mcpSkillsEnabled({ VANTA_MCP_SKILLS: "off" } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("mountMcpSkills — gate", () => {
  it("is a no-op when VANTA_MCP_SKILLS is off (does not even connect)", async () => {
    const commands = new PluginCommandRegistry();
    const res = await mountMcpSkills(commands, {} as NodeJS.ProcessEnv, {
      connections: [connection("docs", fakeClient([{ name: "p" }]))],
    });
    expect(res.skills).toEqual([]);
    expect(commands.list()).toEqual([]);
  });
});

describe("mountMcpSkills — registration + listing", () => {
  it("registers a connected server's skills so they appear in /skills and are invokable", async () => {
    const commands = new PluginCommandRegistry();
    const client = fakeClient([{ name: "summarize", description: "summarize text", arguments: [{ name: "topic", required: true }] }]);
    const res = await mountMcpSkills(commands, ON, { connections: [connection("docs", client)] });

    // appears in the registered skill list (what /skills renders)
    expect(res.skills).toEqual([
      { name: "mcp-docs-summarize", description: "summarize text", server: "docs" },
    ]);
    // and in the command registry (what /help + dispatch use)
    expect(commands.list().map((c) => c.name)).toContain("mcp-docs-summarize");

    // invoking the registered command routes through the kernel gate then getPrompt
    const cmd = commands.get("mcp-docs-summarize")!;
    const out = await cmd.handler("AI", ctxWith(async () => allow));
    expect(out.output).toContain("rendered");
    expect(client.getPrompt).toHaveBeenCalledWith("summarize", { topic: "AI" });
  });

  it("skips servers that are not connected", async () => {
    const commands = new PluginCommandRegistry();
    const res = await mountMcpSkills(commands, ON, {
      connections: [connection("down", fakeClient([{ name: "p" }]), "error")],
    });
    expect(res.skills).toEqual([]);
    expect(commands.list()).toEqual([]);
  });

  it("skips a skill whose name collides with a built-in, without aborting the rest", async () => {
    const commands = new PluginCommandRegistry(new Set(["mcp-docs-help"]));
    const client = fakeClient([{ name: "help" }, { name: "search" }]);
    const res = await mountMcpSkills(commands, ON, { connections: [connection("docs", client)] });
    expect(res.skills.map((s) => s.name)).toEqual(["mcp-docs-search"]);
    expect(commands.get("mcp-docs-help")).toBeUndefined();
    expect(commands.get("mcp-docs-search")).toBeDefined();
  });

  it("dispose closes the live clients", async () => {
    const commands = new PluginCommandRegistry();
    const client = fakeClient([{ name: "p" }]);
    const res = await mountMcpSkills(commands, ON, { connections: [connection("docs", client)] });
    res.dispose();
    expect(client.close).toHaveBeenCalled();
  });
});
