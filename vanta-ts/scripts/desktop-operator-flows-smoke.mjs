import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { _electron as electron } from "playwright-core";

const home = await mkdtemp(join(tmpdir(), "vanta-desktop-operator-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-operator-profile-"));
const project = await mkdtemp(join(tmpdir(), "vanta-desktop-operator-project-"));
const port = process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7823";
const executablePath = process.env.VANTA_DESKTOP_APP;
let app;
let telegramApi;
const rendererErrors = [];
const expectedFirstRunFailures = new Set(["/api/status", "/api/tools"]);
let expectedMcpConflict = false;
let queuedInstruction = "";

try {
  telegramApi = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    if (req.url?.endsWith("/getMe")) res.end(JSON.stringify({ ok: true, result: { username: "vanta_smoke_bot" } }));
    else res.end(JSON.stringify({ ok: true, result: [] }));
  });
  await new Promise((resolveListen, rejectListen) => {
    telegramApi.once("error", rejectListen);
    telegramApi.listen(0, "127.0.0.1", resolveListen);
  });
  const telegramAddress = telegramApi.address();
  if (!telegramAddress || typeof telegramAddress === "string") throw new Error("Telegram API fixture did not bind");
  const telegramApiBase = `http://127.0.0.1:${telegramAddress.port}`;
  await mkdir(join(home, "sessions"), { recursive: true });
  await mkdir(join(home, "skills", "operator-smoke"), { recursive: true });
  await mkdir(join(project, "docs"), { recursive: true });
  await mkdir(join(home, "Library", "Application Support", "Claude"), { recursive: true });
  await writeFile(join(home, "skills", "operator-smoke", "SKILL.md"), "---\nname: Operator smoke skill\ndescription: A real stored skill for the desktop smoke.\n---\nUse this fixture.", "utf8");
  await writeFile(join(project, "README.md"), "context fixture", "utf8");
  await writeFile(join(project, "docs", "output.md"), "artifact fixture", "utf8");
  const googleClient = join(project, "google-client.json");
  await writeFile(googleClient, JSON.stringify({ installed: {
    client_id: "desktop-smoke-client-id",
    client_secret: "desktop-smoke-client-secret",
  } }), "utf8");
  const mcpFixture = join(project, "mcp-fixture.mjs");
  await writeFile(mcpFixture, `
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
    if (request.method === "initialize") result = { protocolVersion: "2024-11-05", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "fixture", version: "1" } };
    if (request.method === "tools/list") result = { tools: [{ name: "search_notes", description: "Search notes", inputSchema: { type: "object", properties: {} } }] };
    if (request.method === "resources/list") result = { resources: [{ uri: "fixture://status", name: "Status" }] };
    if (request.method === "resources/read") result = { contents: [{ uri: request.params.uri, text: "fixture ready" }] };
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\\n");
  }
});
`, "utf8");
  await writeFile(join(project, ".mcp.json"), JSON.stringify({ servers: {
    notes: { command: process.execPath, args: [mcpFixture] },
    broken: { command: join(project, "missing-mcp-binary") },
    oauth: { url: "http://127.0.0.1:9/mcp", authorizationUrl: "https://example.test/authorize", tokenUrl: "https://example.test/token", clientId: "desktop-smoke" },
  } }), "utf8");
  await writeFile(join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"), JSON.stringify({ mcpServers: {
    imported: { command: process.execPath, args: [mcpFixture] },
  } }), "utf8");
  await writeFile(join(home, "sessions", "operator-flow.json"), JSON.stringify({
    id: "operator-flow", title: "Operator flow fixture", started: "2026-07-13T00:00:00.000Z", updated: "2026-07-13T00:00:00.000Z",
    messages: [{ role: "assistant", content: "Produced docs/output.md and https://example.test/receipt" }],
  }), "utf8");
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", project] : ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: { ...process.env, HOME: home, VANTA_HOME: home, VANTA_PROJECT_ROOT: project, VANTA_DESKTOP_USER_DATA: userData, VANTA_DESKTOP_PORT: port, VANTA_DESKTOP_AUTOMATION: "1", VANTA_PROVIDER: "openai", VANTA_MODEL: "gpt-4o-mini", OPENAI_API_KEY: "vanta-desktop-smoke-key", VANTA_TELEGRAM_TOKEN: "", VANTA_TELEGRAM_API_BASE: telegramApiBase, VANTA_TELEGRAM_WEBHOOK_SECRET: "", ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => rendererErrors.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    // Network response handling below preserves the affected URL. Chromium's generic
    // 500 console line has no URL, so recording it would duplicate an actionable check.
    const expectedConflict = expectedMcpConflict && text.includes("Failed to load resource: the server responded with a status of 409");
    const genericHttpError = text.includes("Failed to load resource: the server responded with a status of 400")
      || text.includes("Failed to load resource: the server responded with a status of 500");
    if (message.type() === "error" && !expectedConflict && !genericHttpError) rendererErrors.push(`console error: ${text}`);
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (response.status() === 400) rendererErrors.push(`HTTP 400: ${path}`);
    if (response.status() >= 500 && !expectedFirstRunFailures.has(path)) rendererErrors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.setDefaultTimeout(30_000);
  await page.locator(".app-shell").waitFor();
  await page.waitForFunction(() => {
    const composer = document.querySelector("#vanta-composer");
    return composer instanceof HTMLTextAreaElement && !composer.disabled;
  });
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.locator(".right-rail").waitFor();
  await page.locator(".right-rail").getByRole("tab", { name: "Activity", exact: true }).waitFor();
  await page.getByRole("dialog", { name: "Review" }).getByRole("button", { name: "Close review" }).click();

  const paneWidths = () => page.locator(".app-shell").evaluate((shell) => ({
    sidebar: Number.parseInt(getComputedStyle(shell).getPropertyValue("--sidebar-width"), 10),
  }));
  const initialPanes = await paneWidths();
  await page.getByRole("separator", { name: "Resize sessions" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction((previous) => Number.parseInt(getComputedStyle(document.querySelector(".app-shell")).getPropertyValue("--sidebar-width"), 10) > previous, initialPanes.sidebar);
  const keyboardPanes = await paneWidths();
  const sidebarHandle = page.getByRole("separator", { name: "Resize sessions" });
  const sidebarBox = await sidebarHandle.boundingBox();
  if (!sidebarBox) throw new Error("Sidebar resize handle is not visible");
  await page.mouse.move(sidebarBox.x + sidebarBox.width / 2, sidebarBox.y + sidebarBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sidebarBox.x + sidebarBox.width / 2 + 24, sidebarBox.y + sidebarBox.height / 2);
  await page.mouse.up();
  await page.waitForFunction((previous) => Number.parseInt(getComputedStyle(document.querySelector(".app-shell")).getPropertyValue("--sidebar-width"), 10) > previous, keyboardPanes.sidebar);
  const resizedPanes = await paneWidths();

  let releaseChat;
  await page.route(/\/api\/chat$/, (route) => new Promise((resolve) => {
    releaseChat = () => { void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ finalText: "Stopped by operator.", events: [{ label: "Stopped by operator.", ok: false }] }) }).then(resolve); };
  }));
  await page.route(/\/api\/chat\/stop$/, async (route) => {
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ stopping: true }) });
    releaseChat?.();
  });
  await page.route(/\/api\/chat\/queue$/, async (route) => {
    if (route.request().method() === "POST") queuedInstruction = route.request().postDataJSON().message;
    const items = queuedInstruction ? [{
      id: "operator-queued-turn",
      instruction: queuedInstruction,
      intent: "next",
      status: "queued",
      revision: 1,
      position: 1,
      createdAt: "2026-07-17T12:00:00.000Z",
      updatedAt: "2026-07-17T12:00:00.000Z",
      target: { sessionId: "operator-flow", root: project, controllerId: "Local Mac", model: "gpt-4o-mini", accessMode: "approve" },
    }] : [];
    const body = route.request().method() === "GET"
      ? { revision: 1, items }
      : { queued: true, snapshot: { revision: 1, items } };
    await route.fulfill({ status: route.request().method() === "GET" ? 200 : 202, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.locator("#vanta-composer").fill("start a cancellable fixture");
  await page.locator("#vanta-composer").press("Enter");
  await page.getByRole("button", { name: "Stop task" }).waitFor();
  await page.locator("#vanta-composer").fill("then summarize the result");
  await page.getByTitle("Queue next").click();
  await page.locator(".inline-queue-trigger").waitFor();
  await page.getByRole("button", { name: "Stop task" }).click();
  await page.getByText("Stopped by operator.").first().waitFor();
  await page.unroute(/\/api\/chat$/);
  let quietTraceTurn = 0;
  await page.route(/\/api\/chat$/, async (route) => {
    quietTraceTurn += 1;
    const failed = quietTraceTurn === 2;
    const events = failed
      ? [{ label: "✗ shell_cmd: permission denied", ok: false, kind: "tool_end", name: "shell_cmd", detail: "permission denied: fixture command" }]
      : [
        { label: "✓ read_file: README", ok: true, kind: "tool_end", name: "read_file", detail: "README full output" },
        { label: "✓ grep_files: routes", ok: true, kind: "tool_end", name: "grep_files", detail: "routes full output" },
        { label: "✓ write_file: changed fixture.ts", ok: true, kind: "tool_end", name: "write_file", detail: "+ const quiet = true" },
      ];
    const receipt = {
      status: failed ? "failed" : "done",
      ...(failed ? { failureKind: "tool" } : {}),
      events,
      actions: failed ? ["retry_failed_step"] : [],
      ...(failed ? { checkpoint: { instruction: "run the failing fixture" } } : {}),
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ finalText: failed ? "The fixture command failed." : "Updated fixture.ts.", events, receipt }) });
  });
  await page.locator("#vanta-composer").fill("make a quiet trace code change");
  await page.waitForFunction(() => {
    const button = document.querySelector(".send-button");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByLabel("Conversation history").getByText("make a quiet trace code change", { exact: true }).waitFor();
  await page.waitForTimeout(500);
  const quietTraceText = await page.locator(".conversation-stage").innerText();
  if (!quietTraceText.includes("Read and searched 2 times")) throw new Error(`Quiet trace response was not rendered: ${quietTraceText}`);
  await page.locator(".conversation-stage .quiet-trace").getByText(/changed fixture\.ts/).waitFor();
  const quietDetails = page.locator(".quiet-trace details");
  if (await quietDetails.count() !== 2) throw new Error(`Quiet trace rendered ${await quietDetails.count()} rows instead of 2`);
  await quietDetails.first().locator("summary").click();
  await page.getByText("README full output").waitFor();
  await page.locator("#vanta-composer").fill("run the failing fixture");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.locator(".conversation-stage .quiet-trace strong").getByText("✗ shell_cmd: permission denied", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Retry failed step" }).waitFor();

  await page.getByRole("button", { name: "Connect" }).click();
  await page.locator(".operator-view").getByRole("heading", { name: "Connect", exact: true }).waitFor();
  await page.getByRole("button", { name: "Test model" }).click();
  await page.getByText(/is resolved with model/).waitFor();
  await page.getByRole("tab", { name: "Capabilities" }).click();
  await page.getByText("Operator smoke skill").waitFor();

  await page.getByRole("tab", { name: "MCP", exact: true }).click();
  const mcp = page.locator(".mcp-control-center");
  await mcp.getByText("MCP connectors").waitFor();
  const mcpApi = await page.evaluate(() => fetch("/api/connect/mcp", { headers: { "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" } }).then(async (response) => ({ status: response.status, body: await response.json() })));
  if (mcpApi.status !== 200 || !mcpApi.body.connectors?.some((item) => item.name === "oauth")) {
    const statusApi = await page.evaluate(() => fetch("/api/status", { headers: { "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" } }).then(async (response) => ({ status: response.status, body: await response.json() })));
    throw new Error(`MCP fixture missing in Electron at ${page.url()}: ${JSON.stringify({ mcpApi, statusApi })}`);
  }
  await page.locator(".mcp-server-list").getByRole("button", { name: /oauth/ }).click();
  await mcp.getByRole("button", { name: "Authorize" }).waitFor();
  await page.locator(".mcp-server-list").getByRole("button", { name: /notes/ }).click();
  await mcp.getByRole("button", { name: "Trust", exact: true }).click();
  await mcp.getByRole("button", { name: "Test", exact: true }).click();
  await mcp.getByText("search_notes", { exact: true }).waitFor();
  await mcp.getByRole("button", { name: /fixture:\/\/status/ }).click();
  await mcp.getByText(/fixture ready/).waitFor();
  await page.locator(".mcp-server-list").getByRole("button", { name: /broken/ }).click();
  await mcp.getByRole("button", { name: "Trust", exact: true }).click();
  expectedMcpConflict = true;
  await mcp.getByRole("button", { name: "Reconnect", exact: true }).click();
  await mcp.locator(".mcp-error").waitFor();
  await mcp.getByRole("button", { name: "Disable", exact: true }).click();
  await mcp.getByText("Disabled", { exact: true }).first().waitFor();
  await mcp.getByRole("button", { name: "Import Claude Desktop" }).click();
  await page.locator(".mcp-server-list").getByRole("button", { name: /imported/ }).waitFor();
  const fetchCatalog = mcp.locator(".mcp-catalog article").filter({ hasText: "fetch" }).first();
  await fetchCatalog.getByRole("button", { name: "Install" }).click();
  await page.locator(".mcp-server-list").getByRole("button", { name: /fetch/ }).waitFor();
  await mcp.getByText("Recent receipts").waitFor();

  await page.getByRole("tab", { name: "Messaging" }).click();
  await page.getByRole("button", { name: /Telegram/ }).click();
  await page.getByLabel("Telegram Token").fill(`123456:${"a".repeat(35)}`);
  await page.getByRole("button", { name: "Save credentials" }).click();
  await page.getByText("Ready", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Test bot" }).click();
  await page.getByText(/Telegram bot vanta_smoke_bot responded/).waitFor();
  await page.getByRole("button", { name: "Start gateway" }).waitFor();

  await page.getByRole("tab", { name: "Google", exact: true }).click();
  await page.getByRole("heading", { name: "Google Workspace" }).waitFor();
  await page.getByLabel("Downloaded client JSON path").fill(googleClient);
  await page.getByRole("button", { name: "Save client file" }).click();
  await page.getByText("Client saved. Authorize Gmail, Calendar, or Drive separately.").waitFor();
  await page.getByRole("button", { name: "Start Google consent" }).waitFor();

  const artifactApi = await page.evaluate(() => fetch("/api/artifacts", { headers: { "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" } }).then(async (response) => ({ status: response.status, body: await response.json() })));
  if (artifactApi.status !== 200 || !artifactApi.body.some((item) => item.value === "https://example.test/receipt")) throw new Error(`Artifact API fixture missing: ${JSON.stringify(artifactApi)}`);
  await page.locator(".product-switcher").click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("dialog", { name: "Review" }).getByRole("button", { name: "Outputs" }).click();
  await page.locator(".operator-view").getByRole("heading", { name: "Outputs", exact: true }).waitFor();
  await page.getByText("https://example.test/receipt").waitFor();

  await page.locator(".product-switcher").click();
  await page.locator(".composer").getByTitle("Change agent model").click();
  await page.getByRole("heading", { name: "Choose a model" }).waitFor();
  if (process.env.VANTA_DESKTOP_MODEL_PICKER_SCREENSHOT) await page.screenshot({ path: process.env.VANTA_DESKTOP_MODEL_PICKER_SCREENSHOT, fullPage: false });
  await page.getByPlaceholder("Search models and providers").fill("__missing_model__");
  await page.getByText("No matching providers or models.").waitFor();
  await page.getByPlaceholder("Search models and providers").fill("");
  await page.locator(".model-provider-nav button").first().waitFor();
  await page.locator(".model-picker").getByRole("button", { name: "Close model picker" }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.locator(".inspector-tabs button").filter({ hasText: "Files" }).click();
  await page.locator(".right-rail").waitFor();
  await page.locator(".files-panel").waitFor();
  const fileButton = page.locator(".file-list button").first();
  await fileButton.waitFor();
  const file = (await fileButton.getAttribute("title"))?.trim();
  if (!file) throw new Error("File context fixture has no visible label");
  await fileButton.click();
  await page.getByRole("button", { name: `Remove ${file}` }).waitFor();
  await page.getByRole("dialog", { name: "Review" }).getByRole("button", { name: "Close review" }).click();
  await page.getByRole("button", { name: `Remove ${file}` }).click();
  await page.locator(".context-chips").waitFor({ state: "detached" });
  await page.locator(".right-rail").waitFor({ state: "detached" });

  await page.locator("#vanta-composer").fill("/setup");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.locator(".operator-view").getByRole("heading", { name: "Connect", exact: true }).waitFor();
  await page.getByRole("tab", { name: "Overview", exact: true }).waitFor();
  await page.locator(".product-switcher").click();

  await page.locator(".composer").getByRole("button", { name: "Open commands" }).click();
  await page.getByRole("heading", { name: "Commands" }).waitFor();
  await page.getByRole("button", { name: "Set up Telegram" }).click();
  await page.getByRole("heading", { name: "Telegram" }).waitFor();
  await page.locator('.messaging-detail input[type="password"]').waitFor();
  await page.locator(".product-switcher").click();
  await page.locator("#vanta-composer").fill("how do i setup telgram i dont see the / command");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("heading", { name: "Telegram" }).waitFor();
  await page.locator(".product-switcher").click();
  await page.locator(".conversation-stage").waitFor();
  const telegramConversation = await page.locator(".conversation-stage").innerText();
  const hasTelegramStatus = telegramConversation.includes("Telegram is configured, but the gateway is stopped.");
  if (!hasTelegramStatus || !telegramConversation.includes("Start the gateway: vanta gateway")) throw new Error(`Telegram setup reply was not preserved in Work: ${telegramConversation}`);

  await page.keyboard.press("?");
  await page.getByRole("heading", { name: "Keyboard shortcuts" }).waitFor();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Open personal persona settings" }).click();
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  await page.getByRole("button", { name: "Model", exact: true }).click();
  await page.getByRole("button", { name: "Connect provider" }).click();
  await page.getByRole("heading", { name: "Connect a model" }).waitFor();
  await page.locator(".setup-dialog").getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByRole("button", { name: "Ghost light" }).click();
  await page.locator(".app-shell.theme-light").waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".app-shell.theme-light").waitFor();
  const reloadedPanes = await paneWidths();
  if (reloadedPanes.sidebar !== resizedPanes.sidebar) throw new Error(`Sidebar width did not persist: ${JSON.stringify({ resizedPanes, reloadedPanes })}`);
  if (rendererErrors.length) throw new Error(`Renderer errors: ${rendererErrors.join(" | ")}`);

  if (process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT) await page.screenshot({ path: process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT, fullPage: false });
  process.stdout.write(`${JSON.stringify({ work: true, quietTrace: true, failedTraceRecovery: true, modelPicker: true, connect: true, modelTest: true, capabilities: true, mcpInstall: true, mcpImport: true, mcpTrust: true, mcpOAuthNeeded: true, mcpToolTest: true, mcpResourceRead: true, mcpReconnectFailure: true, mcpDisabled: true, messaging: true, messagingTest: true, googleClientPersistence: true, outputs: true, visibleContextChips: true, queue: true, stop: true, shortcuts: true, settings: true, providerSetup: true, lightTheme: true, resizableSidebar: true, persistentSidebar: true })}\n`);
  await new Promise((resolveDone) => setTimeout(resolveDone, 100));
} finally {
  if (app) {
    const electronProcess = app.process();
    await Promise.race([app.close(), new Promise((resolveClose) => setTimeout(resolveClose, 3_000))]);
    if (electronProcess && !electronProcess.killed) electronProcess.kill("SIGKILL");
  }
  if (telegramApi) await new Promise((resolveClose) => telegramApi.close(resolveClose));
  await Promise.all([rm(home, { recursive: true, force: true }), rm(userData, { recursive: true, force: true }), rm(project, { recursive: true, force: true })]);
}
