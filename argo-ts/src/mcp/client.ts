import { spawn, type ChildProcess } from "node:child_process";

// Minimal MCP (Model Context Protocol) client — stdio transport, JSON-RPC 2.0,
// newline-delimited. No SDK dependency (keeps Vanta lean). Lets Vanta mount
// external MCP servers and call their tools. The transport is injectable so the
// request/response protocol is unit-testable without spawning a process.

export type JsonRpcId = number;

export interface Transport {
  send(line: string): void;
  onMessage(cb: (line: string) => void): void;
  onError(cb: (err: Error) => void): void;
  close(): void;
}

export type McpToolDef = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

const PROTOCOL_VERSION = "2024-11-05";

/** Extract the text from an MCP tools/call result's content array. Pure. */
export function textFromContent(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return JSON.stringify(result);
  return content
    .map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : ""))
    .filter(Boolean)
    .join("\n");
}

export class McpClient {
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, Pending>();
  private buffer = "";

  constructor(private readonly transport: Transport) {
    transport.onMessage((line) => this.onLine(line));
    transport.onError((err) => {
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    });
  }

  private onLine(chunk: string): void {
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      this.dispatch(line);
    }
  }

  private dispatch(line: string): void {
    let msg: { id?: JsonRpcId; result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(line);
    } catch {
      return; // ignore non-JSON (server logging on stdout)
    }
    if (msg.id === undefined) return; // a notification from the server — ignored
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message ?? "mcp error"));
    else p.resolve(msg.result);
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.transport.send(`${payload}\n`);
    });
  }

  private notify(method: string, params?: unknown): void {
    this.transport.send(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  /** Handshake: initialize then send the initialized notification. */
  async initialize(clientName = "argo"): Promise<void> {
    await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: clientName, version: "0.1.0" },
    });
    this.notify("notifications/initialized");
  }

  async listTools(): Promise<McpToolDef[]> {
    const res = (await this.request("tools/list")) as { tools?: McpToolDef[] };
    return res.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const res = await this.request("tools/call", { name, arguments: args });
    return textFromContent(res);
  }

  close(): void {
    this.transport.close();
  }
}

/** Real stdio transport: spawn `command args`, frame JSON-RPC over its stdio. */
export function stdioTransport(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): { transport: Transport; child: ChildProcess } {
  const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], env: env ?? process.env });
  const transport: Transport = {
    send: (line) => child.stdin?.write(line),
    onMessage: (cb) => child.stdout?.on("data", (d: Buffer) => cb(d.toString("utf8"))),
    onError: (cb) => {
      child.on("error", cb);
      child.on("exit", (code) => code && cb(new Error(`mcp server exited (${code})`)));
    },
    close: () => child.kill(),
  };
  return { transport, child };
}
