import { kernelBinaryPath } from "../kernel/path.js";
import { connectServer, reconnectServer, type McpConnection } from "../mcp/connect.js";
import { readMcpConfig } from "../mcp/mount.js";
import {
  appendMcpReceipt,
  readMcpReceipts,
  readMcpRegistry,
  setMcpConnectorEnabled,
  setMcpConnectorTrust,
  type McpConnectorRecord,
} from "../mcp/registry.js";
import { installCatalogMcp } from "../mcp/config-store.js";

export async function runMcpCommand(repoRoot: string, rest: string[]): Promise<void> {
  const sub = rest[0] ?? "list";
  const handlers: Record<string, () => Promise<void>> = {
    serve: () => runMcpServe(repoRoot),
    catalog: () => runMcpCatalog(),
    install: () => runMcpInstall(repoRoot, rest.slice(1)),
    "import-desktop": () => runMcpImportDesktop(repoRoot),
    test: () => runMcpTest(repoRoot, rest[1], false),
    reconnect: () => runMcpTest(repoRoot, rest[1], true),
    enable: () => runMcpEnable(repoRoot, rest[1], true),
    disable: () => runMcpEnable(repoRoot, rest[1], false),
    trust: () => runMcpTrust(repoRoot, rest[1], rest[2]),
    receipts: () => runMcpReceipts(repoRoot),
    list: () => runMcpList(repoRoot),
  };
  await (handlers[sub] ?? handlers.list!)();
}

async function runMcpServe(repoRoot: string): Promise<void> {
  // stdout is the JSON-RPC stream; every diagnostic must stay on stderr.
  console.log = console.error;
  const { ensureKernel } = await import("../kernel-launcher.js");
  const { createKernelClient } = await import("../kernel/client.js");
  const { buildRegistry } = await import("../tools/index.js");
  const { resolveServeAllowlist, runMcpServer, stdioServerTransport } = await import("../mcp/server.js");
  const baseUrl = await ensureKernel({
    baseUrl: process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788",
    kernelBin: kernelBinaryPath(repoRoot),
    root: repoRoot,
  });
  const safety = createKernelClient(baseUrl);
  const registry = buildRegistry();
  const allowlist = resolveServeAllowlist(process.env);
  console.error(`vanta mcp serve — ${allowlist.size} tool(s) exposed, kernel-gated`);
  await runMcpServer(stdioServerTransport(), {
    registry,
    safety,
    ctx: { root: repoRoot, safety, requestApproval: async () => false },
    allowlist,
  });
}

function formatConnector(record: McpConnectorRecord): string {
  const inventory = `${record.tools.length} tools · ${record.resources.length} resources`;
  const problem = record.lastError ? ` · ${record.lastError}` : "";
  return `  ${record.health.padEnd(11)} ${record.name} · ${record.transport} · ${record.source} · trust ${record.trust} · auth ${record.auth} · ${inventory}${problem}`;
}

async function runMcpList(repoRoot: string): Promise<void> {
  const records = await readMcpRegistry(repoRoot, process.env);
  if (records.length === 0) {
    console.log("  (no MCP connectors — use `vanta mcp catalog`, `install`, or `import-desktop`)");
    return;
  }
  console.log("MCP connectors");
  for (const record of records) console.log(formatConnector(record));
}

async function runMcpTest(repoRoot: string, name: string | undefined, reconnect: boolean): Promise<void> {
  if (!name) { console.error(`usage: vanta mcp ${reconnect ? "reconnect" : "test"} <server>`); return; }
  const target = await resolveTestTarget(repoRoot, name);
  if (!target) { console.error(`MCP connector "${name}" is not configured`); return; }
  const unavailable = unavailableDetail(target.record);
  if (unavailable) {
    await appendMcpReceipt(repoRoot, { action: reconnect ? "reconnect" : "test", server: name, outcome: "failed", detail: unavailable });
    console.log(`  ${name}: ${unavailable}`);
    return;
  }
  const result = await executeMcpProbe(repoRoot, name, target, reconnect);
  await recordTestReceipt(repoRoot, name, result, reconnect);
  try { result.client?.close(); } catch { /* already closed */ }
  console.log(formatTestResult(name, result));
}

async function resolveTestTarget(repoRoot: string, name: string): Promise<{ spec: import("../mcp/mount-config.js").ServerSpec; record: McpConnectorRecord } | null> {
  const [config, records] = await Promise.all([readMcpConfig(process.env, repoRoot), readMcpRegistry(repoRoot, process.env)]);
  const spec = config.servers[name];
  const record = records.find((item) => item.name === name);
  return spec && record ? { spec, record } : null;
}

function unavailableDetail(record: McpConnectorRecord): string | null {
  if (!record.enabled) return "disabled for this project";
  if (record.auth === "needs_auth") return "authentication required";
  return null;
}

async function executeMcpProbe(
  repoRoot: string,
  name: string,
  target: NonNullable<Awaited<ReturnType<typeof resolveTestTarget>>>,
  reconnect: boolean,
): Promise<McpConnection> {
  if (reconnect) return reconnectServer(name, { env: process.env, cwd: repoRoot });
  return connectServer(name, target.spec, { env: process.env, root: repoRoot, record: target.record });
}

async function recordTestReceipt(repoRoot: string, name: string, result: McpConnection, reconnect: boolean): Promise<void> {
  if (reconnect) return;
  const ok = result.status === "connected";
  await appendMcpReceipt(repoRoot, {
    action: "test",
    server: name,
    outcome: ok ? "passed" : "failed",
    detail: ok ? `${result.tools.length} tools, ${result.resources?.length ?? 0} resources` : result.error ?? result.status,
  });
}

function formatTestResult(name: string, result: McpConnection): string {
  const detail = result.status === "connected"
    ? `${result.tools.length} tools · ${result.resources?.length ?? 0} resources`
    : result.error ?? "not ready";
  return `  ${name}: ${result.status} · ${detail}`;
}

async function runMcpEnable(repoRoot: string, name: string | undefined, enabled: boolean): Promise<void> {
  if (!name) { console.error(`usage: vanta mcp ${enabled ? "enable" : "disable"} <server>`); return; }
  await setMcpConnectorEnabled(repoRoot, name, enabled);
  await appendMcpReceipt(repoRoot, { action: enabled ? "enable" : "disable", server: name, outcome: "passed", detail: enabled ? "enabled for project" : "disabled for project" });
  console.log(`  ${name}: ${enabled ? "enabled" : "disabled"} for this project`);
}

async function runMcpTrust(repoRoot: string, name: string | undefined, decision: string | undefined): Promise<void> {
  if (!name || !["allow", "deny"].includes(decision ?? "")) { console.error("usage: vanta mcp trust <server> <allow|deny>"); return; }
  const trusted = decision === "allow";
  await setMcpConnectorTrust(repoRoot, name, trusted);
  await appendMcpReceipt(repoRoot, { action: "trust", server: name, outcome: "passed", detail: trusted ? "trusted for project" : "denied for project" });
  console.log(`  ${name}: ${trusted ? "trusted" : "denied"} for this project; kernel safety remains active`);
}

async function runMcpReceipts(repoRoot: string): Promise<void> {
  const receipts = await readMcpReceipts(repoRoot);
  if (receipts.length === 0) { console.log("  (no MCP connector receipts)"); return; }
  for (const receipt of receipts.slice(-50)) console.log(`  ${receipt.at} ${receipt.action} ${receipt.server ?? "registry"} ${receipt.outcome} · ${receipt.detail}`);
}

async function runMcpCatalog(): Promise<void> {
  const { MCP_CATALOG } = await import("../mcp/catalog.js");
  console.log("Vetted MCP connectors (vanta mcp install <name>):");
  for (const entry of MCP_CATALOG) console.log(`  ${entry.name} — ${entry.description} · defaults: ${entry.defaultTools.join(", ")}`);
}

async function runMcpImportDesktop(repoRoot: string): Promise<void> {
  const { importDesktopMcp } = await import("../mcp/desktop-import.js");
  const result = await importDesktopMcp();
  await appendMcpReceipt(repoRoot, { action: "import", outcome: result.ok ? "passed" : "failed", detail: result.ok ? `imported ${result.imported.length}, skipped ${result.skipped.length}` : result.error });
  if (!result.ok) { console.log(`  ${result.error}`); return; }
  console.log(`  imported ${result.imported.length}, skipped ${result.skipped.length} → ${result.targetPath}`);
}

async function runMcpInstall(repoRoot: string, rest: string[]): Promise<void> {
  const name = rest[0];
  if (!name) { console.error("usage: vanta mcp install <name> [--with-tool <tool>]…"); return; }
  const withTools: string[] = [];
  for (let i = 1; i < rest.length; i += 1) if (rest[i] === "--with-tool" && rest[i + 1]) withTools.push(rest[++i]!);
  const result = await installCatalogMcp(name, withTools, process.env);
  await appendMcpReceipt(repoRoot, { action: "install", server: name, outcome: result.ok ? "passed" : "failed", detail: result.ok ? result.detail : result.error });
  if (!result.ok) { console.error(result.error); return; }
  console.log(`installed "${name}" → ${result.path} (${result.detail})`);
}
