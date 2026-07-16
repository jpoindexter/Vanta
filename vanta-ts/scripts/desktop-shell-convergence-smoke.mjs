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
      { role: "assistant", content: "I am **mapping** the current shell against the project rail and Vanta kernel boundary.\n\n- Conversation stays central\n- Proof stays visible", toolCalls: [
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
  const approvalDecisions = [];
  let approvalIndex = 0;
  const smokeApprovals = [
    {
      id: "convergence-file-approval",
      action: "Edit file desktop-app/src/App.tsx",
      reason: "Apply the accepted desktop shell convergence change.",
      toolName: "edit_file",
      request: {
        kind: "file_edit",
        title: "File edit permission request",
        subject: "desktop-app/src/App.tsx",
        reason: "Apply the accepted desktop shell convergence change.",
        sections: [
          { label: "Target file", value: "desktop-app/src/App.tsx", tone: "code" },
          { label: "Preview", value: "- old shell\n+ accepted desktop shell", tone: "code" },
        ],
      },
    },
    {
      id: "convergence-shell-approval",
      action: "run shell command: npm run deploy",
      reason: "Shell command changes the outside world.",
      toolName: "shell_cmd",
      request: {
        kind: "bash",
        title: "Bash permission request",
        subject: "npm run deploy",
        reason: "Shell command changes the outside world.",
        sections: [
          { label: "Command", value: "npm run deploy", tone: "code" },
          { label: "Options", value: "Runs inside the current project root.", tone: "muted" },
        ],
      },
    },
  ];
  await page.route("**/api/approval", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(smokeApprovals[approvalIndex] ?? null),
      });
      return;
    }
    const body = route.request().postDataJSON();
    approvalDecisions.push({ id: body.id, decision: body.decision });
    approvalIndex += 1;
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
  await page.locator(".message-content").first().waitFor();
  const userMessage = page.locator(".message.user").first();
  await userMessage.getByRole("toolbar", { name: "Message actions" }).waitFor();
  await userMessage.getByRole("button", { name: "Copy message" }).click();
  await userMessage.getByText("Copied message").waitFor();
  const assistantMessage = page.locator(".message.assistant").first();
  await assistantMessage.getByRole("toolbar", { name: "Response actions" }).waitFor();
  await assistantMessage.locator(".message-markdown strong").getByText("mapping").waitFor();
  await assistantMessage.getByRole("button", { name: "Copy response" }).click();
  await assistantMessage.getByText("Copied response").waitFor();
  await assistantMessage.getByRole("button", { name: "Mark helpful" }).click();
  if (await assistantMessage.getByRole("button", { name: "Mark helpful" }).getAttribute("aria-pressed") !== "true") throw new Error("Helpful response feedback did not persist selected state");
  await assistantMessage.getByRole("button", { name: "Mark not helpful" }).click();
  await assistantMessage.getByRole("button", { name: "Wrong" }).waitFor();
  await assistantMessage.getByRole("button", { name: "Wrong" }).click();
  if (await assistantMessage.getByRole("button", { name: "Wrong" }).getAttribute("aria-pressed") !== "true") throw new Error("Not-helpful reason did not persist selected state");
  await assistantMessage.getByRole("button", { name: "Mark helpful" }).click();
  await assistantMessage.getByRole("button", { name: "Expand response" }).click();
  await page.getByRole("dialog", { name: "Vanta transcript" }).waitFor();
  await page.getByRole("button", { name: "Close expanded response" }).click();
  await page.getByRole("dialog", { name: "Vanta transcript" }).waitFor({ state: "detached" });
  await page.locator(".run-timeline").waitFor();
  const inlineApproval = page.locator(".inline-approval");
  await inlineApproval.waitFor();
  await inlineApproval.getByText("File edit permission request").waitFor();
  await inlineApproval.getByText("Target file").waitFor();
  await inlineApproval.getByText("Preview").waitFor();
  await inlineApproval.getByText("- old shell").waitFor();
  await inlineApproval.getByRole("button", { name: "Allow once" }).click();
  await inlineApproval.waitFor({ state: "detached" });
  if (approvalDecisions[0]?.decision !== "allow") throw new Error(`Inline approval did not post allow: ${JSON.stringify(approvalDecisions)}`);
  await inlineApproval.waitFor();
  await inlineApproval.getByText("Bash permission request").waitFor();
  await inlineApproval.getByText("npm run deploy").first().waitFor();
  await inlineApproval.getByRole("button", { name: "Reject" }).click();
  await inlineApproval.waitFor({ state: "detached" });
  if (approvalDecisions[1]?.decision !== "deny") throw new Error(`Inline approval did not post reject: ${JSON.stringify(approvalDecisions)}`);
  await page.locator(".conversation-stage").waitFor();
  await page.locator("#vanta-composer").waitFor();
  const taskContext = page.getByLabel("Task execution context");
  await taskContext.getByText(/Tools \d+/).waitFor();
  await taskContext.getByText("Memory local").waitFor();
  await page.getByRole("button", { name: /Change session model/ }).waitFor();
  await page.locator(".approval-mode").getByText("Ask").waitFor();
  await page.getByRole("button", { name: "Open commands" }).waitFor();
  await page.getByRole("button", { name: "Open command palette" }).click();
  await page.getByRole("dialog", { name: "Command palette" }).waitFor();
  const pointerPaletteFocus = await focusState(page);
  if (pointerPaletteFocus.modality !== "pointer" || pointerPaletteFocus.outlineWidth !== 0) throw new Error(`Pointer-open command palette showed a keyboard focus ring: ${JSON.stringify(pointerPaletteFocus)}`);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+K");
  await page.getByRole("dialog", { name: "Command palette" }).waitFor();
  const keyboardPaletteFocus = await focusState(page);
  if (keyboardPaletteFocus.modality !== "keyboard" || keyboardPaletteFocus.outlineWidth < 1) throw new Error(`Keyboard-open command palette lost its focus ring: ${JSON.stringify(keyboardPaletteFocus)}`);
  await page.keyboard.press("Escape");

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
  await page.getByRole("heading", { name: "Choose a model" }).waitFor();
  await page.getByPlaceholder("Search models and providers").fill("openai");
  const pointerModelFocus = await focusState(page);
  if (pointerModelFocus.modality !== "pointer" || pointerModelFocus.outlineWidth !== 0) throw new Error(`Pointer-open model picker showed a keyboard focus ring: ${JSON.stringify(pointerModelFocus)}`);
  await page.keyboard.press("Tab");
  const keyboardModelFocus = await focusState(page);
  if (keyboardModelFocus.modality !== "keyboard" || keyboardModelFocus.outlineWidth < 1) throw new Error(`Keyboard navigation in model picker lost its focus ring: ${JSON.stringify(keyboardModelFocus)}`);
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
    if (viewport.width === 760 && process.env.VANTA_DESKTOP_CONVERGENCE_COMPACT_SCREENSHOT) {
      const closeInspector = page.getByRole("button", { name: "Close inspector" });
      if (await closeInspector.isVisible().catch(() => false)) await closeInspector.click();
      await page.locator(".right-rail").waitFor({ state: "detached" });
      await page.waitForFunction(() => (document.querySelector(".session-sidebar")?.getBoundingClientRect().right ?? 0) <= 1);
      await page.screenshot({ path: process.env.VANTA_DESKTOP_CONVERGENCE_COMPACT_SCREENSHOT, fullPage: false });
    }
    responsive.push(metrics);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".mobile-nav").waitFor();
  await page.getByRole("button", { name: "Copy response" }).first().waitFor();
  await page.getByRole("button", { name: "Expand response" }).first().waitFor();
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
  if (!await inspector.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Open contextual inspector" }).click();
    await inspector.waitFor();
  }
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
      workToolbar: rect(".work-toolbar"),
      inspector: rect(".right-rail"),
      inspectorTabs: rect(".inspector-tabs"),
      composer: rect(".composer"),
      assistantMessage: rect(".message.assistant .message-content"),
      userMessage: rect(".message.user .message-markdown"),
      statusbar: rect(".desktop-statusbar"),
    };
  });
  if (geometry.sidebar.width < 250 || geometry.sidebar.width > 340) throw new Error(`Project rail width drifted: ${JSON.stringify(geometry)}`);
  if (Math.abs(geometry.sidebar.right - geometry.titlebarIdentity.right) > 2) throw new Error(`Titlebar is not pane-aligned: ${JSON.stringify(geometry)}`);
  if (geometry.titlebarControls.left < 70) throw new Error(`Titlebar controls overlap the macOS traffic-light zone: ${JSON.stringify(geometry)}`);
  if (Math.abs(geometry.titlebarControls.right - geometry.titlebarIdentity.right) > 16) throw new Error(`Titlebar controls are not right-aligned in the project rail: ${JSON.stringify(geometry)}`);
  if (await page.locator(".titlebar-brand").count()) throw new Error("Redundant in-app product branding returned to the titlebar");
  if (geometry.inspectorTabs.top - geometry.inspector.top > 4) throw new Error(`Inspector tabs do not own the tray top: ${JSON.stringify(geometry)}`);
  if (Math.abs(geometry.workToolbar.height - geometry.inspectorTabs.height) > 1) throw new Error(`Work toolbar and inspector tabs have different heights: ${JSON.stringify(geometry)}`);
  if (Math.abs(geometry.workToolbar.bottom - geometry.inspectorTabs.bottom) > 1) throw new Error(`Work toolbar and inspector tabs do not share a baseline: ${JSON.stringify(geometry)}`);
  if (geometry.composer.width > 780 || geometry.composer.width < 560) throw new Error(`Composer width drifted from the Codex-style work surface: ${JSON.stringify(geometry)}`);
  if (geometry.assistantMessage.width > 780) throw new Error(`Transcript reading column is too wide: ${JSON.stringify(geometry)}`);
  if (Math.abs(geometry.composer.left - geometry.assistantMessage.left) > 2) throw new Error(`Composer and transcript are not aligned: ${JSON.stringify(geometry)}`);
  if (geometry.userMessage.right > geometry.assistantMessage.right + 1) throw new Error(`Operator message exceeds the transcript edge: ${JSON.stringify(geometry)}`);
  if (Math.abs(geometry.statusbar.height - 27) > 1) throw new Error(`Statusbar height drifted: ${JSON.stringify(geometry)}`);
  const visual = await page.evaluate(() => {
    const style = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing visual surface ${selector}`);
      const computed = getComputedStyle(element);
      return { background: computed.backgroundColor, color: computed.color, display: computed.display };
    };
    return {
      shell: style(".app-shell"),
      sidebar: style(".session-sidebar"),
      workbench: style(".workbench"),
      inspector: style(".right-rail"),
      assistantMessage: style(".message.assistant"),
      userMessage: style(".message.user .message-markdown"),
      assistantSpeakerLabels: document.querySelectorAll(".message.assistant .message-meta").length,
      sheets: document.styleSheets.length,
    };
  });
  for (const [name, surface] of Object.entries(visual).filter(([name]) => !["sheets", "assistantSpeakerLabels", "assistantMessage"].includes(name))) {
    if (surface.background === "rgba(0, 0, 0, 0)") throw new Error(`${name} surface is transparent: ${JSON.stringify(visual)}`);
  }
  if (visual.assistantMessage.background !== "rgba(0, 0, 0, 0)") throw new Error(`Assistant output regained a message box: ${JSON.stringify(visual)}`);
  if (visual.userMessage.background === "rgba(0, 0, 0, 0)") throw new Error(`Operator message lost its compact bubble: ${JSON.stringify(visual)}`);
  if (visual.assistantSpeakerLabels !== 0) throw new Error(`Redundant assistant speaker chrome returned: ${JSON.stringify(visual)}`);
  if (rendererErrors.length) throw new Error(`Renderer errors: ${rendererErrors.join(" | ")}`);
  process.stdout.write(`${JSON.stringify({ destinations: true, newTask: true, operate: true, inlineApproval: approvalDecisions, inspector: true, modelPicker: true, responsive, compact: true, geometry, visual })}\n`);
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([
    rm(home, { recursive: true, force: true }),
    rm(userData, { recursive: true, force: true }),
    rm(project, { recursive: true, force: true }),
  ]);
}

async function focusState(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return { modality: document.documentElement.dataset.inputModality ?? "", outlineWidth: 0, outlineStyle: "", tag: "" };
    const computed = getComputedStyle(active);
    return {
      modality: document.documentElement.dataset.inputModality ?? "",
      outlineWidth: Number.parseFloat(computed.outlineWidth) || 0,
      outlineStyle: computed.outlineStyle,
      tag: active.tagName,
      className: typeof active.className === "string" ? active.className : "",
    };
  });
}
