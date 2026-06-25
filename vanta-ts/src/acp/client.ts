import { spawn } from "node:child_process";
import {
  parseMessage,
  serializeRequest,
  serializeResult,
  serializeError,
  serializeNotification,
  RPC,
  PROTOCOL_VERSION,
  AGENT_NAME,
  AGENT_VERSION,
  type JsonRpcId,
  type Inbound,
} from "./protocol.js";
import type { KernelClient } from "../kernel/client.js";

// VANTA-ACP-CLIENT — the OUTBOUND half of ACP. Vanta already SERVES ACP
// (acp-server.ts); this drives ANOTHER ACP agent over stdio: initialize → new
// session → prompt turns, forwarding the peer's `session/update` notifications and
// routing its `session/request_permission` requests through the Vanta kernel.
// Reuses the pure protocol codec; the transport is injected (real child stdio /
// a fake in tests), mirroring acp-server.ts and mcp/client.ts.

/** Injectable line transport to the peer agent. */
export interface AcpClientTransport {
  send(line: string): void;
  onMessage(cb: (line: string) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}

export type AcpUpdate = { sessionId: string; update: unknown };
/** Route a peer permission request → allow/deny. Kernel-gated in production. */
export type AcpApprover = (sessionId: string, req: Record<string, unknown>) => Promise<boolean>;

export type AcpClientDeps = {
  transport: AcpClientTransport;
  onUpdate?: (u: AcpUpdate) => void;
  approve?: AcpApprover;
};

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

/** Pick a peer-offered option id matching the decision (allow/reject), else the literal. */
function pickOption(options: Array<{ optionId: string; kind?: string }> | undefined, allowed: boolean): string {
  const want = allowed ? "allow" : "reject";
  const found = options?.find((o) => (o.kind ?? o.optionId).startsWith(want));
  return found?.optionId ?? want;
}

export class AcpClient {
  private pending = new Map<JsonRpcId, Pending>();
  private nextId = 1;
  private buffer = "";

  constructor(private deps: AcpClientDeps) {
    deps.transport.onMessage((chunk) => this.onChunk(chunk));
    deps.transport.onClose(() => this.onClose());
  }

  /** Send a request and resolve with its result (rejects on a peer error). */
  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.deps.transport.send(serializeRequest(id, method, params));
    });
  }

  initialize(): Promise<unknown> {
    return this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: AGENT_NAME, version: AGENT_VERSION },
    });
  }

  async newSession(cwd: string): Promise<string> {
    const r = (await this.request("session/new", { cwd })) as { sessionId?: string };
    return r.sessionId ?? "";
  }

  prompt(sessionId: string, text: string): Promise<{ stopReason: string }> {
    return this.request("session/prompt", { sessionId, prompt: [{ type: "text", text }] }) as Promise<{ stopReason: string }>;
  }

  cancel(sessionId: string): void {
    this.deps.transport.send(serializeNotification("session/cancel", { sessionId }));
  }

  close(): void {
    this.deps.transport.close();
  }

  private onChunk(chunk: string): void {
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      if (line.trim()) void this.handleLine(line);
    }
  }

  private async handleLine(line: string): Promise<void> {
    const inbound = parseMessage(line);
    if (inbound.kind === "response") return this.resolveResponse(inbound);
    if (inbound.kind === "notification" && inbound.method === "session/update") {
      this.deps.onUpdate?.(inbound.params as AcpUpdate);
      return;
    }
    if (inbound.kind === "request") return this.handlePeerRequest(inbound);
  }

  private resolveResponse(inbound: Extract<Inbound, { kind: "response" }>): void {
    const p = this.pending.get(inbound.id);
    if (!p) return;
    this.pending.delete(inbound.id);
    if (inbound.error) p.reject(new Error(inbound.error.message));
    else p.resolve(inbound.result);
  }

  /** The peer asks US (the client): only `session/request_permission` is handled. */
  private async handlePeerRequest(inbound: Extract<Inbound, { kind: "request" }>): Promise<void> {
    if (inbound.method !== "session/request_permission") {
      this.deps.transport.send(serializeError(inbound.id, RPC.METHOD_NOT_FOUND, `method not found: ${inbound.method}`));
      return;
    }
    const params = (inbound.params ?? {}) as { sessionId?: string; options?: Array<{ optionId: string; kind?: string }> };
    const allowed = this.deps.approve ? await this.deps.approve(params.sessionId ?? "", params as Record<string, unknown>) : false;
    const optionId = pickOption(params.options, allowed);
    this.deps.transport.send(serializeResult(inbound.id, { outcome: { outcome: "selected", optionId } }));
  }

  private onClose(): void {
    for (const p of this.pending.values()) p.reject(new Error("ACP transport closed"));
    this.pending.clear();
  }
}

/** Spawn a peer ACP agent and wrap its stdio as a transport (stderr inherited). */
export function spawnAcpTransport(cmd: string, args: string[], cwd: string): AcpClientTransport {
  const child = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "inherit"] });
  return {
    send: (line) => { child.stdin?.write(line); },
    onMessage: (cb) => { child.stdout?.on("data", (d: unknown) => cb(String(d))); },
    onClose: (cb) => { child.on("close", () => cb()); },
    close: () => { try { child.stdin?.end(); child.kill(); } catch { /* already gone */ } },
  };
}

/** A kernel-gated approver: the peer's requested action is assessed; only Allow approves. */
export function kernelApprover(safety: KernelClient): AcpApprover {
  return async (_sessionId, req) => {
    const tc = req.toolCall as { title?: unknown } | undefined;
    const desc = `acp peer requests: ${String(tc?.title ?? req.title ?? "action")}`;
    try {
      const verdict = await safety.assess(desc);
      return verdict.risk === "allow";
    } catch {
      return false; // fail closed
    }
  };
}

/** Drive a full client session: initialize → new session → each prompt → close. */
export async function runAcpClientSession(o: {
  transport: AcpClientTransport;
  cwd: string;
  prompts: string[];
  approve?: AcpApprover;
  onUpdate?: (u: AcpUpdate) => void;
}): Promise<{ sessionId: string; turns: Array<{ prompt: string; stopReason: string }> }> {
  const client = new AcpClient({ transport: o.transport, approve: o.approve, onUpdate: o.onUpdate });
  await client.initialize();
  const sessionId = await client.newSession(o.cwd);
  const turns: Array<{ prompt: string; stopReason: string }> = [];
  for (const p of o.prompts) {
    const { stopReason } = await client.prompt(sessionId, p);
    turns.push({ prompt: p, stopReason });
  }
  client.close();
  return { sessionId, turns };
}
