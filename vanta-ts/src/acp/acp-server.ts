import { serializeNotification, serializeRequest } from "./protocol.js";
import { SessionManager } from "./session.js";
import { handleLine } from "./dispatch.js";
import type { JsonRpcId } from "./protocol.js";
import type { AgentRunner, SessionUpdate, PermissionRequest } from "./session.js";

// ACP stdio JSON-RPC SERVER — wires the pure protocol codec + SessionManager over
// an INJECTABLE transport (real stdio in production, a fake in tests). It owns the
// server lifecycle: buffering inbound lines, streaming `session/update`
// notifications, and issuing agent→client `session/request_permission` requests,
// correlating their responses. Method routing lives in ./dispatch.js.

// Re-exported so importers + tests keep `import { buildInitializeResult } from "./acp-server.js"`.
export { buildInitializeResult } from "./dispatch.js";

/** The injectable line transport — the same shape as mcp/server.ts ServerTransport. */
export interface AcpTransport {
  send(line: string): void;
  onMessage(cb: (line: string) => void): void;
  onClose(cb: () => void): void;
}

export type AcpServerDeps = {
  /** The injected agent runner — drives one Vanta conversation per prompt turn. */
  runner: AgentRunner;
  /** Default session cwd (the repo root). */
  cwd: string;
};

/**
 * Drive an ACP server over a transport. Returns a promise that resolves when the
 * transport closes (stdin EOF). The session manager + permission correlation are
 * created per call so each server instance is isolated (clean for tests).
 */
export function runAcpServer(transport: AcpTransport, deps: AcpServerDeps): Promise<void> {
  const pendingPermissions = new Map<JsonRpcId, (optionId: string) => void>();
  let nextOutId = 1;

  const sink = {
    update(sessionId: string, update: SessionUpdate): void {
      transport.send(serializeNotification("session/update", { sessionId, update }));
    },
    requestPermission(sessionId: string, req: PermissionRequest): Promise<string> {
      const id = `perm-${nextOutId++}`;
      return new Promise<string>((resolve) => {
        pendingPermissions.set(id, resolve);
        transport.send(serializeRequest(id, "session/request_permission", { sessionId, ...req }));
      });
    },
  };
  const manager = new SessionManager(deps.runner, sink, deps.cwd);

  return new Promise<void>((resolve) => {
    let buffer = "";
    transport.onMessage((chunk) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.trim()) continue;
        void handleLine(line, manager, transport, pendingPermissions);
      }
    });
    transport.onClose(() => {
      for (const resolveOne of pendingPermissions.values()) resolveOne("");
      pendingPermissions.clear();
      resolve();
    });
  });
}

/** Real stdio transport: read JSON-RPC from stdin, write to stdout. */
export function stdioTransport(): AcpTransport {
  return {
    send: (line) => process.stdout.write(line),
    onMessage: (cb) => process.stdin.on("data", (d: Buffer) => cb(d.toString("utf8"))),
    onClose: (cb) => process.stdin.on("end", cb),
  };
}
