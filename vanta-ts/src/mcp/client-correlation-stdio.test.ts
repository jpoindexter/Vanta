import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { McpClient, stdioTransport } from "./client.js";
import { mcpToolToVantaTool } from "./mount-config.js";
import type { ToolContext } from "../tools/types.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const script = String.raw`
const readline = require("node:readline");
const reply = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
let call, calls = 0;
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    reply({ id: request.id, result: { protocolVersion: "2024-11-05", capabilities: {} } });
  } else if (request.method === "tools/call") {
    calls++;
    call = request;
    reply({ id: call.id, method: "elicitation/create", params: { message: "Fixture question" } });
  } else if (!request.method && request.id === call?.id && request.result?.action === "cancel") {
    reply({ method: "fixture/waiting", params: { calls } });
  } else if (request.method === "fixture/release" && call) {
    const isError = call.params.arguments.fail;
    reply({ id: call.id, result: { isError, content: [{ type: "text", text: isError ? "actual tool failure" : "actual tool result" }] } });
  }
});
`;

async function records(root: string, name: string) {
  const text = await readFile(join(root, ".vanta", name), "utf8");
  return text.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function context(): Promise<ToolContext> {
  const root = await mkdtemp(join(tmpdir(), "vanta-mcp-correlation-"));
  roots.push(root);
  return { root, effectCallId: "correlation-fixture", permissionMode: () => "default",
    safety: { assess: async () => ({ risk: "allow", reason: "offline protocol fixture" }) } as unknown as ToolContext["safety"],
    requestApproval: async () => false };
}

describe("MCP same-ID request over real stdio and mapped effect", () => {
  it.each([false, true])("does not acknowledge before the real response (isError=%s)", async (fail) => {
    const source = stdioTransport(process.execPath, ["-e", script], { LANG: "C", ELECTRON_RUN_AS_NODE: "1" });
    const closed = once(source.child, "close");
    let notify!: (value: unknown) => void;
    const waiting = new Promise((resolve) => { notify = resolve; });
    const client = new McpClient(source.transport, {
      onNotification: (method, params) => { if (method === "fixture/waiting") notify(params); },
    });
    const ctx = await context();
    let settled = false;
    let execution: ReturnType<ReturnType<typeof mcpToolToVantaTool>["execute"]> | undefined;
    try {
      await client.initialize();
      const tool = mcpToolToVantaTool(client, "fixture", { name: "operation" });
      execution = tool.execute({ fail }, ctx).finally(() => { settled = true; });
      await expect(waiting).resolves.toEqual({ calls: 1 });
      expect(settled).toBe(false);
      const pending = await records(ctx.root, "tool-effects.jsonl");
      expect(pending.some((row) => row.outcome === "confirmed" || row.acknowledgementId)).toBe(false);
      source.transport.send(`${JSON.stringify({ jsonrpc: "2.0", method: "fixture/release" })}\n`);
      expect(await execution).toMatchObject(fail
        ? { ok: false, effectDisposition: "unknown", output: expect.stringContaining("actual tool failure") }
        : { ok: true, effectDisposition: "confirmed", output: "actual tool result" });
      expect((await records(ctx.root, "tool-effects.jsonl")).at(-1)).toMatchObject({ outcome: fail ? "unknown" : "confirmed" });
      if (fail) {
        expect((await records(ctx.root, "action-receipts.jsonl")).at(-1)).toMatchObject({ disposition: "unknown" });
        expect((await tool.execute({ fail }, ctx)).ok).toBe(false);
      }
    } finally {
      client.close();
      await execution?.catch(() => {});
      await closed;
    }
  });
});
