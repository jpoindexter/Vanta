import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright-core";

const home = await mkdtemp(join(tmpdir(), "vanta-desktop-convergence-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-convergence-profile-"));
const project = await mkdtemp(join(tmpdir(), "vanta-desktop-convergence-project-"));
const port = process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7826";
const executablePath = process.env.VANTA_DESKTOP_APP;
let app;
const rendererErrors = [];

try {
  await mkdir(join(home, "sessions"), { recursive: true });
  await mkdir(join(project, "docs"), { recursive: true });
  await writeFile(join(project, "README.md"), "# Vanta convergence fixture\n", "utf8");
  await writeFile(join(project, "docs", "result.md"), "verified output\n", "utf8");
  await writeFile(join(home, "sessions", "convergence.json"), JSON.stringify({
    id: "convergence",
    title: "Ship the desktop workbench",
    started: "2026-07-14T00:00:00.000Z",
    updated: "2026-07-14T00:00:00.000Z",
    messages: [
      { role: "user", content: "Make the desktop shell feel like a serious operator workbench. Keep the conversation central and make the output easy to verify." },
      { role: "assistant", content: "I am mapping the current shell against the project rail, run timeline, and Vanta kernel boundary.", toolCalls: [
        { id: "read-shell", name: "read_file", arguments: { path: "desktop-app/src/App.tsx" } },
        { id: "compare-demo", name: "browser_act", arguments: { target: "accepted convergence demo" } },
      ] },
      { role: "tool", toolCallId: "read-shell", name: "read_file", content: "Read the current desktop surface" },
      { role: "tool", toolCallId: "compare-demo", name: "browser_act", content: "Compared the accepted convergence demo" },
      { role: "assistant", content: "The shell contract is ready for production verification." },
    ],
  }), "utf8");
  for (const [id, title, turns] of [
    ["models", "Refresh provider models", 4],
    ["recovery", "Recover a failed run", 6],
    ["roadmap", "Review the current roadmap", 3],
    ["release", "Prepare the macOS release", 8],
  ]) {
    await writeFile(join(home, "sessions", `${id}.json`), JSON.stringify({
      id, title, started: "2026-07-13T00:00:00.000Z", updated: "2026-07-13T00:00:00.000Z",
      messages: Array.from({ length: turns }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `${title} turn ${index + 1}` })),
    }), "utf8");
  }

  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", project] : ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      VANTA_HOME: home,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: port,
      VANTA_DESKTOP_AUTOMATION: "1",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "vanta-desktop-smoke-key",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 960 });
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => rendererErrors.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.includes("Failed to load resource")) rendererErrors.push(`console error: ${text}`);
  });
  let approvalDecision;
  await page.route("**/api/approval", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(approvalDecision ? null : {
          id: "convergence-approval",
          action: "write_file desktop-app/src/App.tsx",
          reason: "Apply the accepted desktop shell convergence change.",
          toolName: "write_file",
          request: { subject: "desktop-app/src/App.tsx", reason: "Apply the accepted desktop shell convergence change." },
        }),
      });
      return;
    }
    const body = route.request().postDataJSON();
    approvalDecision = body.decision;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.locator(".app-shell").waitFor();
  await page.locator(".titlebar-leading-actions").waitFor();
  for (const destination of ["Work", "Operate", "Outputs", "Connect"]) {
    await page.getByRole("button", { name: destination, exact: true }).waitFor();
  }
  await page.getByRole("toolbar", { name: "Task controls" }).waitFor();
  await page.getByRole("button", { name: "Background" }).waitFor();
  await page.locator(".desktop-statusbar").getByText(/Gateway/).waitFor();
  const fixtureMessage = page.getByText(/Make the desktop shell feel like a serious operator workbench/);
  if (!await fixtureMessage.isVisible().catch(() => false)) {
    const fixtureSession = page.locator(".session-list .session").filter({ hasText: "Ship the desktop workbench" });
    await fixtureSession.waitFor();
    const openedResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/sessions/open");
    await fixtureSession.click();
    const response = await openedResponse;
    const opened = await response.json();
    if (!opened.messages?.some((message) => message.content?.includes("serious operator workbench"))) throw new Error(`Packaged session response lost transcript: ${JSON.stringify(opened)}`);
  }
  await fixtureMessage.waitFor();
  await page.locator(".project-session-group .session-row").first().waitFor();
  await page.locator(".recent-session-group .session-row").first().waitFor();
  await page.locator(".message-avatar").first().waitFor();
  await page.locator(".run-timeline").waitFor();
  const inlineApproval = page.locator(".inline-approval");
  await inlineApproval.waitFor();
  await inlineApproval.getByRole("button", { name: "Allow once" }).click();
  await inlineApproval.waitFor({ state: "detached" });
  if (approvalDecision !== "allow") throw new Error(`Inline approval did not post allow: ${approvalDecision ?? "missing"}`);
  await page.locator(".conversation-stage").waitFor();
  await page.locator("#vanta-composer").waitFor();
  await page.getByRole("button", { name: "Open commands" }).waitFor();

  await page.locator(".session-sidebar").getByRole("button", { name: "New task", exact: true }).click();
  const newTask = page.getByRole("dialog", { name: "Start a new task" });
  await newTask.waitFor();
  await newTask.getByRole("combobox", { name: "Agent" }).waitFor();
  await newTask.getByRole("combobox", { name: "Execution host" }).waitFor();
  for (const field of ["Project folder", "Base branch", "Model", "First instruction"]) await newTask.getByRole("textbox", { name: field }).waitFor();
  await newTask.getByRole("checkbox", { name: /Use isolated worktree/ }).waitFor();
  await newTask.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Operate", exact: true }).click();
  await page.locator(".operator-view").getByRole("heading", { name: "Operate", exact: true }).waitFor();
  await page.getByText("active tasks", { exact: true }).waitFor();

  await page.getByRole("button", { name: "Work", exact: true }).click();
  const inspectorToggle = page.getByRole("button", { name: "Open contextual inspector" });
  if (await inspectorToggle.isVisible().catch(() => false)) await inspectorToggle.click();
  const inspector = page.locator(".right-rail");
  await inspector.waitFor();
  for (const tab of ["Activity", "Files", "Diff", "Preview", "Receipts", "Terminal"]) {
    await inspector.getByRole("tab", { name: tab, exact: true }).waitFor();
  }
  await inspector.getByRole("tab", { name: "Files", exact: true }).click();
  const fileSearch = inspector.getByPlaceholder("Find a project file");
  await fileSearch.fill("README");
  await fileSearch.fill("");
  await inspector.locator(".file-list button").first().waitFor();

  await page.locator(".composer").getByTitle("Change model").click();
  await page.getByRole("heading", { name: "Models for this task" }).waitFor();
  await page.getByPlaceholder("Search provider or model").fill("openai");
  await page.locator(".model-row").first().waitFor();
  await page.getByRole("button", { name: "Close model picker" }).click();

  const responsive = [];
  for (const viewport of [{ width: 1024, height: 700 }, { width: 760, height: 700 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(({ width, height }) => window.innerWidth === width && window.innerHeight === height, viewport);
    const metrics = await page.evaluate(() => {
      const shell = document.querySelector(".app-shell")?.getBoundingClientRect();
      const inspector = document.querySelector(".right-rail")?.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        shellBottom: shell?.bottom,
        inspectorLeft: inspector?.left,
        inspectorRight: inspector?.right,
      };
    });
    if (metrics.scrollWidth > metrics.viewportWidth + 1) throw new Error(`Responsive shell overflows horizontally: ${JSON.stringify(metrics)}`);
    if ((metrics.shellBottom ?? 0) > metrics.viewportHeight + 1) throw new Error(`Responsive shell exceeds viewport: ${JSON.stringify(metrics)}`);
    if ((metrics.inspectorLeft ?? 0) < -1 || (metrics.inspectorRight ?? 0) > metrics.viewportWidth + 1) throw new Error(`Responsive inspector exceeds viewport: ${JSON.stringify(metrics)}`);
    responsive.push(metrics);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".mobile-nav").waitFor();
  const compact = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    shellHeight: document.querySelector(".app-shell")?.getBoundingClientRect().height,
    viewportHeight: window.innerHeight,
  }));
  if (compact.scrollWidth > compact.viewportWidth + 1) throw new Error(`Compact shell overflows horizontally: ${JSON.stringify(compact)}`);
  if ((compact.shellHeight ?? 0) > compact.viewportHeight + 1) throw new Error(`Compact shell exceeds viewport: ${JSON.stringify(compact)}`);

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.waitForFunction(() => window.innerWidth === 1440 && window.innerHeight === 960);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await inspector.getByRole("tab", { name: "Activity", exact: true }).click();
  if (process.env.VANTA_DESKTOP_CONVERGENCE_SCREENSHOT) {
    await page.screenshot({ path: process.env.VANTA_DESKTOP_CONVERGENCE_SCREENSHOT, fullPage: false });
  }
  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing geometry surface ${selector}`);
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    return {
      sidebar: rect(".session-sidebar"),
      titlebarIdentity: rect(".titlebar-identity"),
      titlebarControls: rect(".titlebar-leading-actions"),
      inspector: rect(".right-rail"),
      inspectorTabs: rect(".inspector-tabs"),
      composer: rect(".composer"),
      message: rect(".message-content"),
      statusbar: rect(".desktop-statusbar"),
    };
  });
  if (geometry.sidebar.width < 250 || geometry.sidebar.width > 340) throw new Error(`Project rail width drifted: ${JSON.stringify(geometry)}`);
  if (Math.abs(geometry.sidebar.right - geometry.titlebarIdentity.right) > 2) throw new Error(`Titlebar is not pane-aligned: ${JSON.stringify(geometry)}`);
  if (geometry.titlebarControls.left < 70) throw new Error(`Titlebar controls overlap the macOS traffic-light zone: ${JSON.stringify(geometry)}`);
  if (await page.locator(".titlebar-brand").count()) throw new Error("Redundant in-app product branding returned to the titlebar");
  if (geometry.inspectorTabs.top - geometry.inspector.top > 4) throw new Error(`Inspector tabs do not own the tray top: ${JSON.stringify(geometry)}`);
  if (geometry.composer.width > 660 || geometry.composer.width < 480) throw new Error(`Composer width drifted from the accepted demo: ${JSON.stringify(geometry)}`);
  if (geometry.message.width > 700) throw new Error(`Transcript reading column is too wide: ${JSON.stringify(geometry)}`);
  if (Math.abs(geometry.statusbar.height - 27) > 1) throw new Error(`Statusbar height drifted: ${JSON.stringify(geometry)}`);
  const visual = await page.evaluate(() => {
    const style = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing visual surface ${selector}`);
      const computed = getComputedStyle(element);
      return { background: computed.backgroundColor, color: computed.color, display: computed.display };
    };
    return { shell: style(".app-shell"), sidebar: style(".session-sidebar"), workbench: style(".workbench"), inspector: style(".right-rail"), sheets: document.styleSheets.length };
  });
  for (const [name, surface] of Object.entries(visual).filter(([name]) => name !== "sheets")) {
    if (surface.background === "rgba(0, 0, 0, 0)") throw new Error(`${name} surface is transparent: ${JSON.stringify(visual)}`);
  }
  if (rendererErrors.length) throw new Error(`Renderer errors: ${rendererErrors.join(" | ")}`);
  process.stdout.write(`${JSON.stringify({ destinations: true, newTask: true, operate: true, inlineApproval: approvalDecision === "allow", inspector: true, modelPicker: true, responsive, compact: true, geometry, visual })}\n`);
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([
    rm(home, { recursive: true, force: true }),
    rm(userData, { recursive: true, force: true }),
    rm(project, { recursive: true, force: true }),
  ]);
}
