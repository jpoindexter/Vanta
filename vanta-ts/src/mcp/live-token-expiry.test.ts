import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectServer, reconnectServer, type McpConnection } from "./connect.js";
import { mountMcpServers } from "./mount.js";
import { loadMcpToken, saveMcpToken, type McpToken } from "./auth-store.js";
import { AuthPendingRegistry } from "./auth-pending.js";
import { readMcpRegistry, setMcpConnectorTrust } from "./registry.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { EffectGateContext } from "../effects/execute-effect.js";

let root: string, home: string, env: NodeJS.ProcessEnv, server: Server, url: string;
let requests: Array<{ method: string; authorization?: string }>;
let rejectHttp: boolean;
const clients: McpConnection[] = [];
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-live-token-")); home = join(root, "home");
  await mkdir(join(home, ".git"), { recursive: true });
  env = { HOME: home, VANTA_HOME: home };
  vi.stubEnv("VANTA_ALLOW_PRIVATE_FETCH", "1"); vi.stubEnv("VANTA_HOME", home); vi.stubEnv("HOME", home);
  requests = []; rejectHttp = false;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      const call = JSON.parse(body);
      requests.push({ method: call.method, authorization: req.headers.authorization });
      if (rejectHttp) { res.writeHead(401); res.end("Unauthorized"); return; }
      if (call.id === undefined) { res.writeHead(204); res.end(); return; }
      const result = call.method === "initialize" ? { protocolVersion: "2024-11-05", capabilities: {} }
        : call.method === "tools/list" ? { tools: [{ name: "read_fixture", inputSchema: { type: "object" } }] } : { resources: [] };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: call.id, result }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  clients.splice(0).forEach(client => client.client?.close());
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true });
});
const spec = () => ({ url, authorizationUrl: url + "/authorize", tokenUrl: url + "/token", clientId: "fixture", token: "synthetic-static-other" });
function gate(approval?: () => Promise<boolean>): EffectGateContext {
  return { projectRoot: root, sessionId: "fixture", permissionMode: "default",
    kernel: { assess: vi.fn(async () => ({ risk: approval ? "ask" as const : "allow" as const, reason: "Fixture" })) },
    approval: { request: vi.fn(approval ?? (async () => true)) } };
}
async function configure(token?: McpToken) {
  await writeFile(join(root, ".mcp.json"), JSON.stringify({ mcpServers: { remote: spec() } }));
  await setMcpConnectorTrust(root, "remote", true);
  if (token) await saveMcpToken("remote", token, env);
}
const tokenBytes = () => readFile(join(home, "mcp-auth-tokens.json"), "utf8");
async function effectText(directory = join(root, ".vanta")): Promise<string> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return ""; }
  const chunks: string[] = [];
  for (const entry of entries) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) chunks.push(await effectText(file));
    else if (file.includes("effect")) chunks.push(await readFile(file, "utf8"));
  }
  return chunks.join("\n");
}

describe("known-expired stored MCP token launch boundary", () => {
  it.each(["connect", "reconnect", "mount"])("%s refuses locally before transport, alternate credential, or effect authority", async mode => {
    const token = { access_token: "synthetic-expired", refresh_token: "synthetic-unused", expiry_date: 1 };
    await configure(token);
    const before = await tokenBytes(), effectGate = gate();
    if (mode === "mount") {
      const pending = new AuthPendingRegistry(), registry = new InMemoryToolRegistry(), logs: string[] = [];
      const result = await mountMcpServers(registry, env, line => logs.push(line), { cwd: root, pending, effectGate });
      expect(result.toolCount).toBe(0); expect(registry.schemas()).toEqual([]);
      expect(pending.names()).toEqual(["remote"]); expect(logs.join("\n")).toMatch(/auth/i); result.dispose();
    } else {
      const record = (await readMcpRegistry(root, env))[0];
      const result = mode === "connect" ? await connectServer("remote", spec(), { env, root, record, effectGate })
        : await reconnectServer("remote", { env, cwd: root });
      clients.push(result);
      expect(result.status).toBe("needs_auth"); expect(result.error).toMatch(/locally expired/i);
      expect(result.error).not.toMatch(/HTTP 401|no command or url/i); expect(result.tools).toEqual([]);
    }
    expect(requests).toEqual([]); expect(effectGate.kernel.assess).not.toHaveBeenCalled();
    expect(effectGate.approval!.request).not.toHaveBeenCalled(); expect(await effectText()).toBe("");
    expect(await tokenBytes()).toBe(before); expect(await loadMcpToken("remote", env)).toEqual(token);
  });
});

describe("MCP launch token compatibility", () => {
  it.each([
    { label: "future", token: { access_token: "synthetic-future", expiry_date: Number.MAX_SAFE_INTEGER }, auth: "Bearer synthetic-future" },
    { label: "unknown expiry", token: { access_token: "synthetic-legacy" }, auth: "Bearer synthetic-legacy" },
    { label: "missing token", token: undefined, auth: "Bearer synthetic-static-other" },
    { label: "missing access token", token: { refresh_token: "synthetic-unused", expiry_date: 1 }, auth: "Bearer synthetic-static-other" },
  ])("keeps $label discovery/credential behavior", async ({ token, auth }) => {
    await configure(token); const before = token ? await tokenBytes() : null;
    const result = await connectServer("remote", spec(), { env, root }); clients.push(result);
    expect(result.status).toBe("connected"); expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(request => request.authorization === auth)).toBe(true);
    if (before) expect(await tokenBytes()).toBe(before);
  });

  it("keeps static-only HTTP and truthful server rejection without locally inventing expiry", async () => {
    const connected = await connectServer("static", { url, token: "synthetic-static" }, { env, root }); clients.push(connected);
    expect(connected.status).toBe("connected"); expect(requests[0]?.authorization).toBe("Bearer synthetic-static");
    requests.length = 0; rejectHttp = true; await configure();
    const pending = new AuthPendingRegistry(), registry = new InMemoryToolRegistry();
    const result = await mountMcpServers(registry, env, () => {}, { cwd: root, pending, effectGate: gate() });
    expect(result.toolCount).toBe(0); expect(pending.names()).toEqual(["remote"]);
    expect(requests.filter(request => request.method === "initialize")).toHaveLength(1); result.dispose();
  });

  it("does not apply HTTP token expiry to an owned stdio fixture", async () => {
    await configure({ access_token: "synthetic-expired", expiry_date: 1 });
    const fixture = join(root, "stdio.mjs");
    await writeFile(fixture, `import readline from 'node:readline';readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;const result=m.method==='initialize'?{protocolVersion:'2024-11-05',capabilities:{}}:m.method==='tools/list'?{tools:[]}:{resources:[]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');});`);
    const result = await connectServer("remote", { command: process.execPath, args: [fixture] }, { env: { ...env, PATH: process.env.PATH }, root });
    clients.push(result); expect(result.status).toBe("connected"); expect(requests).toEqual([]);
  });
});

describe("fresh MCP token guard after approval", () => {
  it.each(["connect", "mount"])("%s rechecks after approval waits, keeping unknown-effect custody", async mode => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    await configure({ access_token: "synthetic-expiring", refresh_token: "synthetic-unused", expiry_date: 2000 });
    const before = await tokenBytes();
    const effectGate = gate(async () => { clock.mockReturnValue(3000); return true; });
    const pending = new AuthPendingRegistry(), registry = new InMemoryToolRegistry();
    const perform = async () => {
      if (mode === "connect") {
        const result = await connectServer("remote", spec(), { env, root, effectGate }); clients.push(result);
        expect(result.status).toBe("needs_auth"); expect(result.error).toMatch(/locally expired/i);
      } else {
        const result = await mountMcpServers(registry, env, () => {}, { cwd: root, pending, effectGate });
        expect(result.toolCount).toBe(0); expect(pending.names()).toEqual(["remote"]); result.dispose();
      }
    };
    await perform(); expect(requests).toEqual([]); expect(effectGate.approval!.request).toHaveBeenCalledOnce();
    const retained = await effectText(); expect(retained).toMatch(/"outcome":\s*"unknown"/);
    await perform(); expect(requests).toEqual([]); expect(await effectText()).toBe(retained);
    expect(effectGate.kernel.assess).toHaveBeenCalledOnce(); expect(await tokenBytes()).toBe(before);
  });
});
