import { describe, expect, it } from "vitest";
import { McpClient, type Transport } from "./client.js";

function connection() {
  let receive: ((line: string) => void) | undefined;
  const sent: Array<Record<string, unknown>> = [];
  const transport: Transport = {
    send(line) { sent.push(JSON.parse(line)); },
    onMessage(callback) { receive = callback; },
    onError() {}, close() {},
  };
  return { sent, client: new McpClient(transport),
    emit: (message: Record<string, unknown>) => receive?.(`${JSON.stringify(message)}\n`) };
}

describe("MCP bidirectional request correlation", () => {
  it.each(["elicitation/create", "server/unsupported"])(
    "answers a colliding %s without completing the outbound tool call", async (method) => {
      const source = connection();
      let settled = false;
      const result = source.client.callTool("operation", {}).finally(() => { settled = true; });
      const id = source.sent[0]!.id;
      try {
        source.emit({ jsonrpc: "2.0", id, method, params: { message: "Fixture question" } });
        await new Promise((resolve) => setImmediate(resolve));
        expect(settled).toBe(false);
        expect(source.sent[1]).toMatchObject(method === "elicitation/create"
          ? { id, result: { action: "cancel" } }
          : { id, error: { code: -32601 } });
        source.emit({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "actual result" }] } });
        await expect(result).resolves.toBe("actual result");
        expect(source.sent.filter((message) => message.method === "tools/call")).toHaveLength(1);
      } finally { source.client.close(); await result.catch(() => {}); }
    },
  );

  it("keeps a colliding server request separate from the later RPC rejection", async () => {
    const source = connection();
    const result = source.client.callTool("operation", {});
    const rejection = expect(result).rejects.toThrow("actual rejection");
    const id = source.sent[0]!.id;
    try {
      source.emit({ jsonrpc: "2.0", id, method: "elicitation/create" });
      source.emit({ jsonrpc: "2.0", id, error: { code: -32603, message: "actual rejection" } });
      await rejection;
    } finally { source.client.close(); }
  });
});
