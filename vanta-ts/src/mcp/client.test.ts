import { describe, it, expect } from "vitest";
import { McpClient, textFromContent, textFromMessageContent, type Transport } from "./client.js";

const waitUntil = async (cond: () => boolean, maxTicks = 100): Promise<void> => {
  for (let i = 0; i < maxTicks; i++) { if (cond()) return; await new Promise((r) => setTimeout(r, 5)); }
  if (!cond()) throw new Error("waitUntil: condition not met");
};

/**
 * A fake transport that auto-replies to JSON-RPC requests via a scripted
 * responder, so the client's request/response correlation is tested without a
 * real subprocess. The responder receives the parsed request and returns a
 * `result` object (or throws to simulate an error response).
 */
function fakeTransport(responder: (method: string, params: unknown) => unknown): Transport {
  let onMsg: ((line: string) => void) | null = null;
  return {
    send(line: string) {
      const req = JSON.parse(line) as { id?: number; method: string; params?: unknown };
      if (req.id === undefined) return; // notification — no reply
      queueMicrotask(() => {
        try {
          const result = responder(req.method, req.params);
          onMsg?.(`${JSON.stringify({ jsonrpc: "2.0", id: req.id, result })}\n`);
        } catch (e) {
          onMsg?.(
            `${JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { message: (e as Error).message } })}\n`,
          );
        }
      });
    },
    onMessage(cb) {
      onMsg = cb;
    },
    onError() {},
    close() {},
  };
}

function manualTransport(): { transport: Transport; emit: (line: string) => void; sent: string[] } {
  let onMsg: ((line: string) => void) | null = null;
  const sent: string[] = [];
  return {
    sent,
    emit: (line) => onMsg?.(line),
    transport: {
      send(line: string) { sent.push(line); },
      onMessage(cb) { onMsg = cb; },
      onError() {},
      close() {},
    },
  };
}

describe("textFromContent", () => {
  it("joins text blocks from an MCP result", () => {
    expect(textFromContent({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] })).toBe("a\nb");
  });
  it("stringifies a result with no content array", () => {
    expect(textFromContent({ ok: true })).toBe('{"ok":true}');
  });
  it("is empty for non-objects", () => {
    expect(textFromContent(null)).toBe("");
  });
});

describe("textFromMessageContent", () => {
  it("extracts text from a single content object", () => {
    expect(textFromMessageContent({ type: "text", text: "hello" })).toBe("hello");
  });
  it("joins text from an array of content blocks", () => {
    expect(textFromMessageContent([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("a\nb");
  });
  it("is empty for content without text", () => {
    expect(textFromMessageContent({ type: "image" })).toBe("");
  });
});

describe("McpClient prompts (the MCP skills capability)", () => {
  it("lists prompts and renders one via prompts/get", async () => {
    const client = new McpClient(
      fakeTransport((method, params) => {
        if (method === "prompts/list") {
          return { prompts: [{ name: "summarize", description: "summarize text", arguments: [{ name: "topic", required: true }] }] };
        }
        if (method === "prompts/get") {
          const p = params as { name: string; arguments: { topic: string } };
          return { messages: [{ role: "user", content: { type: "text", text: `prompt:${p.name}:${p.arguments.topic}` } }] };
        }
        throw new Error(`unexpected ${method}`);
      }),
    );
    const prompts = await client.listPrompts();
    expect(prompts).toEqual([{ name: "summarize", description: "summarize text", arguments: [{ name: "topic", required: true }] }]);
    const out = await client.getPrompt("summarize", { topic: "x" });
    expect(out).toBe("prompt:summarize:x");
  });

  it("returns an empty list when the server omits prompts", async () => {
    const client = new McpClient(fakeTransport(() => ({})));
    expect(await client.listPrompts()).toEqual([]);
  });

  it("flattens a multi-message prompt result", async () => {
    const client = new McpClient(
      fakeTransport((method) => {
        if (method === "prompts/get") {
          return { messages: [{ content: { type: "text", text: "line1" } }, { content: { type: "text", text: "line2" } }] };
        }
        return {};
      }),
    );
    expect(await client.getPrompt("multi")).toBe("line1\nline2");
  });
});

describe("McpClient", () => {
  it("initializes, lists tools, and calls a tool over the transport", async () => {
    const client = new McpClient(
      fakeTransport((method, params) => {
        if (method === "initialize") return { protocolVersion: "2024-11-05", capabilities: {} };
        if (method === "tools/list") {
          return { tools: [{ name: "echo", description: "echoes", inputSchema: { type: "object" } }] };
        }
        if (method === "tools/call") {
          const p = params as { name: string; arguments: { text: string } };
          return { content: [{ type: "text", text: `echo: ${p.arguments.text}` }] };
        }
        throw new Error(`unexpected ${method}`);
      }),
    );

    await client.initialize();
    const tools = await client.listTools();
    expect(tools).toEqual([{ name: "echo", description: "echoes", inputSchema: { type: "object" } }]);

    const out = await client.callTool("echo", { text: "hi" });
    expect(out).toBe("echo: hi");
  });

  it("rejects the pending request on a JSON-RPC error response", async () => {
    const client = new McpClient(
      fakeTransport((method) => {
        if (method === "tools/call") throw new Error("tool blew up");
        return {};
      }),
    );
    await expect(client.callTool("boom", {})).rejects.toThrow("tool blew up");
  });

  it("correlates concurrent requests to their own responses", async () => {
    const client = new McpClient(
      fakeTransport((method, params) => {
        if (method === "tools/call") {
          const p = params as { arguments: { n: number } };
          return { content: [{ type: "text", text: String(p.arguments.n * 2) }] };
        }
        return {};
      }),
    );
    const [a, b, c] = await Promise.all([
      client.callTool("d", { n: 1 }),
      client.callTool("d", { n: 2 }),
      client.callTool("d", { n: 3 }),
    ]);
    expect([a, b, c]).toEqual(["2", "4", "6"]);
  });

  it("surfaces server notifications through events", async () => {
    const t = manualTransport();
    const seen: string[] = [];
    new McpClient(t.transport, { onNotification: (method) => { seen.push(method); } });
    t.emit(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: { pct: 1 } })}\n`);
    await waitUntil(() => seen.length >= 1);
    expect(seen).toEqual(["notifications/progress"]);
  });

  it("answers server elicitation requests and surfaces the result event", async () => {
    const t = manualTransport();
    const seen: string[] = [];
    new McpClient(t.transport, {
      onElicitation: async ({ method }) => {
        seen.push(`ask:${method}`);
        return { action: "cancel", content: {}, reason: "no UI" };
      },
      onElicitationResult: ({ method }) => { seen.push(`result:${method}`); },
    });
    t.emit(`${JSON.stringify({ jsonrpc: "2.0", id: 7, method: "elicitation/create", params: { message: "Name?" } })}\n`);
    await waitUntil(() => seen.length >= 2);
    expect(seen).toEqual(["ask:elicitation/create", "result:elicitation/create"]);
    expect(JSON.parse(t.sent[0] ?? "{}")).toMatchObject({ id: 7, result: { action: "cancel" } });
  });
});
