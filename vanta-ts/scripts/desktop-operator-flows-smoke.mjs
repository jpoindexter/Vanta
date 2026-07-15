import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const home = await mkdtemp(join(tmpdir(), "vanta-desktop-operator-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-operator-profile-"));
const project = await mkdtemp(join(tmpdir(), "vanta-desktop-operator-project-"));
const port = process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7823";
const executablePath = process.env.VANTA_DESKTOP_APP;
let app;
const rendererErrors = [];
const expectedFirstRunFailures = new Set(["/api/status", "/api/tools"]);

try {
  await mkdir(join(home, "sessions"), { recursive: true });
  await mkdir(join(home, "skills", "operator-smoke"), { recursive: true });
  await mkdir(join(project, "docs"), { recursive: true });
  await writeFile(join(home, "skills", "operator-smoke", "SKILL.md"), "---\nname: Operator smoke skill\ndescription: A real stored skill for the desktop smoke.\n---\nUse this fixture.", "utf8");
  await writeFile(join(project, "README.md"), "context fixture", "utf8");
  await writeFile(join(project, "docs", "output.md"), "artifact fixture", "utf8");
  await writeFile(join(home, "sessions", "operator-flow.json"), JSON.stringify({
    id: "operator-flow", title: "Operator flow fixture", started: "2026-07-13T00:00:00.000Z", updated: "2026-07-13T00:00:00.000Z",
    messages: [{ role: "assistant", content: "Produced docs/output.md and https://example.test/receipt" }],
  }), "utf8");
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", project] : ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: { ...process.env, VANTA_HOME: home, VANTA_DESKTOP_USER_DATA: userData, VANTA_DESKTOP_PORT: port, VANTA_DESKTOP_AUTOMATION: "1", ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => rendererErrors.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    // Network response handling below preserves the affected URL. Chromium's generic
    // 500 console line has no URL, so recording it would duplicate an actionable check.
    if (message.type() === "error" && !text.includes("Failed to load resource: the server responded with a status of 500")) rendererErrors.push(`console error: ${text}`);
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (response.status() >= 500 && !expectedFirstRunFailures.has(path)) rendererErrors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.setDefaultTimeout(30_000);
  await page.locator(".app-shell").waitFor();
  await page.getByRole("button", { name: "Work" }).waitFor();
  const inspectorToggle = page.getByRole("button", { name: "Open contextual inspector" });
  if (await inspectorToggle.isVisible().catch(() => false)) await inspectorToggle.click();
  await page.locator(".right-rail").waitFor();
  await page.locator(".right-rail").getByRole("tab", { name: "Activity", exact: true }).waitFor();

  const paneWidths = () => page.locator(".app-shell").evaluate((shell) => ({
    sidebar: Number.parseInt(getComputedStyle(shell).getPropertyValue("--sidebar-width"), 10),
    rail: Number.parseInt(getComputedStyle(shell).getPropertyValue("--rail-width"), 10),
  }));
  const initialPanes = await paneWidths();
  await page.getByRole("separator", { name: "Resize sessions" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction((previous) => Number.parseInt(getComputedStyle(document.querySelector(".app-shell")).getPropertyValue("--sidebar-width"), 10) > previous, initialPanes.sidebar);
  await page.getByRole("separator", { name: "Resize outputs" }).focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction((previous) => Number.parseInt(getComputedStyle(document.querySelector(".app-shell")).getPropertyValue("--rail-width"), 10) > previous, initialPanes.rail);
  const keyboardPanes = await paneWidths();
  const sidebarHandle = page.getByRole("separator", { name: "Resize sessions" });
  const sidebarBox = await sidebarHandle.boundingBox();
  if (!sidebarBox) throw new Error("Sidebar resize handle is not visible");
  await page.mouse.move(sidebarBox.x + sidebarBox.width / 2, sidebarBox.y + sidebarBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sidebarBox.x + sidebarBox.width / 2 + 24, sidebarBox.y + sidebarBox.height / 2);
  await page.mouse.up();
  await page.waitForFunction((previous) => Number.parseInt(getComputedStyle(document.querySelector(".app-shell")).getPropertyValue("--sidebar-width"), 10) > previous, keyboardPanes.sidebar);
  const railHandle = page.getByRole("separator", { name: "Resize outputs" });
  const railBox = await railHandle.boundingBox();
  if (!railBox) throw new Error("Outputs resize handle is not visible");
  await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + railBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(railBox.x + railBox.width / 2 - 24, railBox.y + railBox.height / 2);
  await page.mouse.up();
  await page.waitForFunction((previous) => Number.parseInt(getComputedStyle(document.querySelector(".app-shell")).getPropertyValue("--rail-width"), 10) > previous, keyboardPanes.rail);
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
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ queued: true }) });
  });
  await page.locator("#vanta-composer").fill("start a cancellable fixture");
  await page.locator("#vanta-composer").press("Enter");
  await page.getByRole("button", { name: "Stop current run" }).waitFor();
  await page.locator("#vanta-composer").fill("then summarize the result");
  await page.getByTitle("Queue next instruction").click();
  await page.getByText("Next instruction queued.").last().waitFor();
  await page.getByRole("button", { name: "Stop current run" }).click();
  await page.getByText("Stopped by operator.").first().waitFor();

  await page.getByRole("button", { name: "Connect" }).click();
  await page.locator(".operator-view").getByRole("heading", { name: "Connect", exact: true }).waitFor();
  await page.getByRole("tab", { name: "Capabilities" }).click();
  await page.getByText("Operator smoke skill").waitFor();

  await page.getByRole("tab", { name: "Messaging" }).click();
  await page.getByRole("button", { name: /Telegram/ }).click();
  await page.getByLabel("Telegram Token").fill("operator-smoke-token");
  await page.getByRole("button", { name: "Save credentials" }).click();
  await page.getByText("Configured").first().waitFor();

  const artifactApi = await page.evaluate(() => fetch("/api/artifacts").then(async (response) => ({ status: response.status, body: await response.json() })));
  if (artifactApi.status !== 200 || !artifactApi.body.some((item) => item.value === "https://example.test/receipt")) throw new Error(`Artifact API fixture missing: ${JSON.stringify(artifactApi)}`);
  await page.getByRole("button", { name: "Outputs" }).click();
  await page.locator(".operator-view").getByRole("heading", { name: "Outputs", exact: true }).waitFor();
  await page.getByText("https://example.test/receipt").waitFor();

  await page.getByRole("button", { name: "Work" }).click();
  await page.locator(".composer").getByTitle("Change model").click();
  await page.getByRole("heading", { name: "Choose a model" }).waitFor();
  if (process.env.VANTA_DESKTOP_MODEL_PICKER_SCREENSHOT) await page.screenshot({ path: process.env.VANTA_DESKTOP_MODEL_PICKER_SCREENSHOT, fullPage: false });
  await page.getByPlaceholder("Search models and providers").fill("__missing_model__");
  await page.getByText("No matching providers or models.").waitFor();
  await page.getByPlaceholder("Search models and providers").fill("");
  await page.locator(".model-provider-nav button").first().waitFor();
  await page.locator(".model-picker").getByRole("button", { name: "Close model picker" }).click();
  await page.locator("#vanta-composer").press("@");
  await page.locator(".right-rail").waitFor();
  await page.locator(".files-panel").waitFor();
  const fileButton = page.locator(".file-list button").first();
  await fileButton.waitFor();
  const file = (await fileButton.getAttribute("title"))?.trim();
  if (!file) throw new Error("File context fixture has no visible label");
  await fileButton.click();
  await page.getByRole("button", { name: `Remove ${file}` }).waitFor();
  await page.getByRole("button", { name: `Remove ${file}` }).click();
  await page.locator(".context-chips").waitFor({ state: "detached" });
  await page.locator(".right-rail").getByRole("button", { name: "Close inspector" }).click();
  await page.locator(".right-rail").waitFor({ state: "detached" });

  await page.locator("#vanta-composer").press("/");
  await page.getByRole("heading", { name: "Command palette" }).waitFor();
  await page.getByRole("button", { name: "Close" }).click();

  await page.keyboard.press("?");
  await page.getByRole("heading", { name: "Keyboard shortcuts" }).waitFor();
  await page.getByRole("button", { name: "Close" }).click();
  await page.locator(".session-sidebar-footer").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  await page.getByRole("button", { name: "Model", exact: true }).click();
  await page.getByRole("button", { name: "Connect provider" }).click();
  await page.getByRole("heading", { name: "Connect a model" }).waitFor();
  await page.locator(".setup-dialog").getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByRole("button", { name: "Dossier light" }).click();
  await page.locator(".app-shell.theme-light").waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".app-shell.theme-light").waitFor();
  const reloadedPanes = await paneWidths();
  if (reloadedPanes.sidebar !== resizedPanes.sidebar || reloadedPanes.rail !== resizedPanes.rail) throw new Error(`Pane widths did not persist: ${JSON.stringify({ resizedPanes, reloadedPanes })}`);
  if (rendererErrors.length) throw new Error(`Renderer errors: ${rendererErrors.join(" | ")}`);

  if (process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT) await page.screenshot({ path: process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT, fullPage: false });
  process.stdout.write(`${JSON.stringify({ work: true, modelPicker: true, connect: true, capabilities: true, messaging: true, outputs: true, visibleContextChips: true, queue: true, stop: true, shortcuts: true, settings: true, providerSetup: true, lightTheme: true, resizablePanes: true, persistentPanes: true })}\n`);
  await new Promise((resolveDone) => setTimeout(resolveDone, 100));
} finally {
  if (app) {
    const electronProcess = app.process();
    await Promise.race([app.close(), new Promise((resolveClose) => setTimeout(resolveClose, 3_000))]);
    if (electronProcess && !electronProcess.killed) electronProcess.kill("SIGKILL");
  }
  await Promise.all([rm(home, { recursive: true, force: true }), rm(userData, { recursive: true, force: true }), rm(project, { recursive: true, force: true })]);
}
