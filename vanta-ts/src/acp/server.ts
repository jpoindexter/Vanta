import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";

// ACP-SERVE: expose Vanta as an Agent Client Protocol (ACP) server.
// ACP is an HTTP JSON-RPC protocol for in-editor agent integration (Zed, etc.).
// Similar to MCP but agent-oriented: the editor sends instructions and receives responses.
// Every action is still kernel-gated — same safety as a normal session.
// `vanta acp [port]` starts the server; default port 7792.
// registry: agent.json at the repo root describes capabilities.

const DEFAULT_PORT = 7792;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
  res.end(data);
}

export type AcpConfig = {
  port?: number;
  repoRoot: string;
  run: (instruction: string) => Promise<string>;
};

/** Build the agent.json registry object describing Vanta's ACP capabilities. */
export function buildAgentRegistry(repoRoot: string): Record<string, unknown> {
  return {
    name: "vanta",
    version: "1.0",
    description: "Vanta — trusted personal operator. Kernel-gated actions across code, web, comms, files.",
    homepage: "https://github.com/jpoindexter/Vanta",
    capabilities: ["run", "status"],
    actions: [
      {
        name: "run",
        description: "Run an instruction through Vanta's agent loop. Returns the final text response.",
        parameters: { type: "object", properties: { instruction: { type: "string" } }, required: ["instruction"] },
      },
      {
        name: "status",
        description: "Return Vanta's current status (provider, goals, tool count).",
        parameters: { type: "object", properties: {} },
      },
    ],
    rootPath: repoRoot,
  };
}

/** Start the ACP server. */
export function startAcpServer(config: AcpConfig): Promise<{ close: () => void; port: number }> {
  const port = config.port ?? DEFAULT_PORT;
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      if (req.method === "GET" && (req.url === "/" || req.url === "/agent.json")) {
        json(res, 200, buildAgentRegistry(config.repoRoot));
        return;
      }
      if (req.method === "POST" && req.url === "/run") {
        let body: { instruction?: string };
        try { body = JSON.parse(await readBody(req)); } catch { json(res, 400, { error: "invalid json" }); return; }
        if (!body.instruction) { json(res, 400, { error: "instruction required" }); return; }
        try {
          const result = await config.run(body.instruction);
          json(res, 200, { result, agent: "vanta" });
        } catch (err) {
          json(res, 500, { error: (err as Error).message });
        }
        return;
      }
      if (req.method === "GET" && req.url === "/status") {
        json(res, 200, { status: "ready", agent: "vanta", rootPath: config.repoRoot });
        return;
      }
      json(res, 404, { error: "not found" });
    });
    server.listen(port, "127.0.0.1", () => resolve({ close: () => server.close(), port }));
    server.on("error", reject);
  });
}

/** Generate agent.json at repoRoot/agent.json. */
export async function writeAgentJson(repoRoot: string): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    join(repoRoot, "agent.json"),
    JSON.stringify(buildAgentRegistry(repoRoot), null, 2) + "\n",
    "utf8",
  );
}
