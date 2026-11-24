import { createServer } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const executablePath = resolve(
  process.env.VANTA_DESKTOP_APP
    ?? "release/mac-arm64/Vanta.app/Contents/MacOS/Vanta",
);
const home = await mkdtemp(join(tmpdir(), "vanta-mcp-runtime-home-"));
const profile = await mkdtemp(join(tmpdir(), "vanta-mcp-runtime-profile-"));
const project = await mkdtemp(join(tmpdir(), "vanta-mcp-runtime-project-"));
const port = await availablePort();
const fixture = join(project, "mcp-fixture.mjs");
let app;

try {
  await writeFile(fixture, `
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk.toString();
  for (;;) {
    const index = buffer.indexOf("\\n");
    if (index < 0) break;
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const request = JSON.parse(line);
    if (request.id === undefined) continue;
    let result = {};
    if (request.method === "initialize") result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "runtime-fixture", version: "1" } };
    if (request.method === "tools/list") result = { tools: [{ name: "runtime_ping", description: "Runtime path proof", inputSchema: { type: "object", properties: {} } }] };
    if (request.method === "resources/list") result = { resources: [] };
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\\n");
  }
});
`, "utf8");
  await writeFile(join(project, ".mcp.json"), JSON.stringify({
    servers: {
      runtime: { command: "node", args: [fixture] },
      missing: { command: "vanta-mcp-that-does-not-exist" },
    },
  }), "utf8");

  app = await electron.launch({
    executablePath,
    args: ["--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: home,
      PATH: ["/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(delimiter),
      VANTA_HOME: home,
      VANTA_PROJECT_ROOT: project,
      VANTA_DESKTOP_USER_DATA: profile,
      VANTA_DESKTOP_PORT: String(port),
      VANTA_DESKTOP_AUTOMATION: "1",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(30_000);
  await page.locator(".app-shell").waitFor();

  const result = await page.evaluate(async () => {
    const boundary = window.vantaDesktop?.boundaryToken ?? "";
    const headers = { "content-type": "application/json", "x-vanta-desktop-boundary": boundary };
    const act = async (name, action) => {
      const response = await fetch("/api/connect/mcp", {
        method: "POST",
        headers,
        body: JSON.stringify({ name, action }),
      });
      return { status: response.status, body: await response.json() };
    };
    await act("runtime", "trust");
    const runtime = await act("runtime", "test");
    await act("missing", "trust");
    const missing = await act("missing", "test");
    return { runtime, missing };
  });

  const runtimeConnector = result.runtime.body.connectors?.find((item) => item.name === "runtime");
  if (result.runtime.status !== 200 || runtimeConnector?.health !== "ready" || runtimeConnector?.tools?.[0] !== "runtime_ping") {
    throw new Error(`Packaged Node MCP probe failed: ${JSON.stringify(result.runtime)}`);
  }
  if (
    result.missing.status !== 409
    || !result.missing.body.error?.includes('Executable "vanta-mcp-that-does-not-exist" was not found')
  ) {
    throw new Error(`Missing executable recovery was not actionable: ${JSON.stringify(result.missing)}`);
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    packaged: true,
    finderPath: true,
    discoveredTools: runtimeConnector.tools.length,
    actionableMissingExecutable: true,
  })}\n`);
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([
    rm(home, { recursive: true, force: true }),
    rm(profile, { recursive: true, force: true }),
    rm(project, { recursive: true, force: true }),
  ]);
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate MCP smoke port");
  await new Promise((resolveClose) => server.close(resolveClose));
  return address.port;
}
