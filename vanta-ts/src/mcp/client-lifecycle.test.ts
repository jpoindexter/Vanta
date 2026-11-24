import { afterEach, describe, expect, it } from "vitest";
import type { ChildProcess } from "node:child_process";
import { McpClient, stdioTransport, type Transport } from "./client.js";

const children = new Set<ChildProcess>();
afterEach(() => { for (const child of children) child.kill(); children.clear(); });

async function bounded(promise: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(() => ({ state: "resolved" }), (error: Error) => ({ state: "rejected", error })),
      new Promise<{ state: string }>((resolve) => { timer = setTimeout(() => resolve({ state: "pending" }), 500); }),
    ]);
  } finally { clearTimeout(timer); }
}

function fixture(script: string) {
  const source = stdioTransport(process.execPath, ["-e", script], { LANG: "C", ELECTRON_RUN_AS_NODE: "1" });
  children.add(source.child);
  source.child.stdin?.on("error", () => {}); // Baseline may write after the child is gone.
  return source;
}

function manual() {
  let message: ((line: string) => void) | undefined;
  let error: ((reason: Error) => void) | undefined;
  const sent: string[] = [];
  let closes = 0;
  const transport: Transport = {
    send(line) { sent.push(line); }, onMessage(callback) { message = callback; },
    onError(callback) { error = callback; }, close() { closes++; },
  };
  return { transport, sent, closes: () => closes,
    error: (reason: Error) => error?.(reason), emit: (line: string) => message?.(line) };
}

describe("MCP stdio terminal lifecycle", () => {
  it.each([
    ["clean exit", "process.exit(0)", "0"],
    ["signal exit", 'process.kill(process.pid, "SIGTERM")', "SIGTERM"],
    ["nonzero exit", "process.exit(7)", "7"],
  ])("rejects pending and future requests after %s", async (_label, action, detail) => {
    const source = fixture(`process.stdin.once("data", () => { ${action}; });`);
    const client = new McpClient(source.transport);
    expect(await bounded(client.initialize())).toMatchObject({ state: "rejected", error: { message: expect.stringContaining(detail) } });
    expect(await bounded(client.listTools())).toMatchObject({ state: "rejected" });
    client.close();
  });

  it("rejects a request when the client is attached after process exit", async () => {
    const source = fixture("process.exit(0)");
    await new Promise<void>((resolve) => source.child.once("close", () => resolve()));
    const client = new McpClient(source.transport);
    expect(await bounded(client.initialize())).toMatchObject({ state: "rejected" });
    client.close();
  });

  it("notifies raw transport subscribers and refuses sends after terminal exit", async () => {
    const source = fixture('process.stdin.once("data", () => process.exit(0))');
    const terminal = new Promise<void>((resolve, reject) => source.transport.onError(reject));
    const observed = bounded(terminal);
    source.transport.send("fixture\n");
    expect(await observed).toMatchObject({ state: "rejected" });
    expect(() => source.transport.send("later\n")).toThrow();
  });

  it("retains a complete response flushed before clean exit", async () => {
    const source = fixture('process.stdin.once("data", (data) => { const r = JSON.parse(data); process.stdout.end(JSON.stringify({id:r.id,result:{tools:[]}})+"\\n", () => process.exit(0)); });');
    const client = new McpClient(source.transport);
    expect(await client.listTools()).toEqual([]);
    client.close();
  });
});

describe("MCP client explicit close", () => {
  it("rejects every pending request and future request without sending again", async () => {
    const source = manual();
    const client = new McpClient(source.transport);
    const pending = [bounded(client.initialize()), bounded(client.listTools())];
    client.close();
    client.close();
    expect(await Promise.all(pending)).toEqual([
      { state: "rejected", error: expect.any(Error) }, { state: "rejected", error: expect.any(Error) },
    ]);
    expect(await bounded(client.callTool("later", {}))).toMatchObject({ state: "rejected" });
    expect(source.sent).toHaveLength(2);
    expect(source.closes()).toBe(1);
  });

  it("does not emit a late elicitation result after close", async () => {
    const source = manual();
    let finish: ((result: Record<string, unknown>) => void) | undefined;
    const client = new McpClient(source.transport, { onElicitation: () => new Promise((resolve) => { finish = resolve; }) });
    source.emit(`${JSON.stringify({ id: 9, method: "elicitation/create" })}\n`);
    client.close();
    finish?.({ action: "cancel" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(source.sent).toEqual([]);
  });

  it("keeps ordinary transport errors recoverable", async () => {
    const source = manual();
    const client = new McpClient(source.transport);
    const failed = bounded(client.listTools());
    source.error(new Error("temporary network failure"));
    expect(await failed).toMatchObject({ state: "rejected" });
    const retry = client.listTools();
    const request = JSON.parse(source.sent.at(-1)!) as { id: number };
    source.emit(`${JSON.stringify({ id: request.id, result: { tools: [] } })}\n`);
    await expect(retry).resolves.toEqual([]);
    client.close();
  });
});
