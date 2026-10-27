import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpClient, type Transport } from "./client.js";
import { mcpToolToVantaTool } from "./mount-config.js";
import type { ToolContext } from "../tools/types.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function connection(result: unknown, rpcError = false, onCall = () => {}) {
  let onMessage: ((line: string) => void) | undefined;
  let calls = 0;
  const transport: Transport = {
    send(line) {
      const request = JSON.parse(line) as { id: number; method: string };
      calls++;
      onCall();
      const reply = rpcError ? { error: { message: "fixture protocol failure" } } : { result };
      queueMicrotask(() => onMessage?.(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, ...reply })}\n`));
    },
    onMessage(callback) { onMessage = callback; }, onError() {}, close() {},
  };
  return { client: new McpClient(transport), calls: () => calls };
}

async function context(risk: "allow" | "ask" | "block" = "allow"): Promise<ToolContext> {
  const root = await mkdtemp(join(tmpdir(), "vanta-mcp-tool-error-"));
  roots.push(root);
  return { root, effectCallId: "fixture-call", permissionMode: () => "default",
    safety: { assess: async () => ({ risk, reason: "offline fixture" }) } as unknown as ToolContext["safety"],
    requestApproval: async () => false };
}

async function records(root: string, file: string): Promise<Array<Record<string, unknown>>> {
  return (await readFile(join(root, ".vanta", file), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
}

describe("MCP client tool execution errors", () => {
  it("rejects explicit isError with the server's complete text diagnostic", async () => {
    const { client } = connection({ isError: true, content: [{ type: "text", text: "first" }, { type: "text", text: "second" }] });
    await expect(client.callTool("fixture", {})).rejects.toMatchObject({ name: "McpToolCallError", message: "first\nsecond" });
  });

  it("provides a nonempty diagnostic for an empty error result", async () => {
    const { client } = connection({ isError: true, content: [] });
    await expect(client.callTool("fixture", {})).rejects.toThrow('MCP tool "fixture" reported an error');
  });

  it("preserves successful text, explicit false, empty and structured fallback output", async () => {
    for (const flag of [undefined, false]) {
      const { client } = connection({ isError: flag, content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] });
      await expect(client.callTool("fixture", {})).resolves.toBe("a\nb");
    }
    await expect(connection({ content: [] }).client.callTool("fixture", {})).resolves.toBe("");
    await expect(connection({ value: 2 }).client.callTool("fixture", {})).resolves.toBe('{"value":2}');
  });

  it("keeps JSON-RPC errors distinct from tool execution errors", async () => {
    await expect(connection(null, true).client.callTool("fixture", {})).rejects.toMatchObject({ name: "Error", message: "fixture protocol failure" });
  });
});

describe("MCP mapped tool effects", () => {
  it("keeps a partial effect followed by isError unknown and does not replay it", async () => {
    const ctx = await context();
    const partial = join(ctx.root, "fixture-remote-effect.txt");
    const source = connection({ isError: true, content: [{ type: "text", text: "fixture refused" }] }, false,
      () => appendFileSync(partial, "applied before error\n"));
    const tool = mcpToolToVantaTool(source.client, "fixture", { name: "operation" });
    const result = await tool.execute({}, ctx);
    expect(result).toMatchObject({ ok: false, effectDisposition: "unknown" });
    expect(result.output).toContain("fixture refused");
    expect(result.output).toContain("do not retry automatically");
    const settled = (await records(ctx.root, "tool-effects.jsonl")).at(-1);
    expect(settled).toMatchObject({ outcome: "unknown" });
    expect(settled).not.toHaveProperty("acknowledgementId");
    expect((await records(ctx.root, "action-receipts.jsonl")).at(-1)).toMatchObject({ disposition: "unknown", verification: "unverified" });
    expect((await records(ctx.root, "work-items.jsonl")).at(-1)).toMatchObject({ state: "needs human" });
    expect((await tool.execute({}, ctx)).ok).toBe(false);
    expect(source.calls()).toBe(1);
    expect(await readFile(partial, "utf8")).toBe("applied before error\n");
  });

  it("preserves successful mapping and generic RPC failure uncertainty", async () => {
    const success = mcpToolToVantaTool(connection({ content: [{ type: "text", text: "ok" }] }).client, "fixture", { name: "operation" });
    expect(await success.execute({}, await context())).toMatchObject({ ok: true, output: "ok", effectDisposition: "confirmed" });
    const failed = mcpToolToVantaTool(connection(null, true).client, "fixture", { name: "operation" });
    const ctx = await context();
    expect(await failed.execute({}, ctx)).toMatchObject({ ok: false, effectDisposition: "unknown" });
    expect((await records(ctx.root, "tool-effects.jsonl")).at(-1)).toMatchObject({ outcome: "unknown" });
  });

  it("retains block and denied-Ask before sending any tool call", async () => {
    for (const risk of ["block", "ask"] as const) {
      const source = connection({ content: [{ type: "text", text: "must not execute" }] });
      const tool = mcpToolToVantaTool(source.client, "fixture", { name: "operation" });
      expect(await tool.execute({}, await context(risk))).toMatchObject({ ok: false, effectDisposition: "denied" });
      expect(source.calls()).toBe(0);
    }
  });
});
