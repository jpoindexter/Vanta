import { _electron as electron } from "playwright-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const port = process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7821";
const executablePath = process.env.VANTA_DESKTOP_APP;
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-layout-profile-"));
const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: executablePath ? ["--project", resolve(process.cwd(), "..")] : ["desktop-app/electron/main.mjs"],
  cwd: process.cwd(),
  env: {
    ...process.env,
    VANTA_DESKTOP_PORT: port,
    VANTA_DESKTOP_USER_DATA: userData,
    VANTA_DESKTOP_AUTOMATION: "1",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "vanta-desktop-smoke-key",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
  },
});

try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1778, height: 1136 });
  await page.locator(".app-shell").waitFor({ timeout: 15_000 });
  await page.locator(".kernel-status.ready").waitFor({ timeout: 30_000 });
  const emptyTypography = await page.locator(".empty-state h2").evaluate((heading) => {
    const computed = getComputedStyle(heading);
    return {
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      lineHeight: computed.lineHeight,
    };
  });
  if (!/(-apple-system|BlinkMacSystemFont|SF Pro Text)/i.test(emptyTypography.fontFamily)) {
    throw new Error(`Empty-state heading is not using the native Codex UI stack: ${emptyTypography.fontFamily}`);
  }
  if (Number.parseFloat(emptyTypography.fontSize) > 28) {
    throw new Error(`Empty-state heading exceeds the workbench type ceiling: ${emptyTypography.fontSize}`);
  }
  if (Number.parseInt(emptyTypography.fontWeight, 10) > 500) {
    throw new Error(`Empty-state heading is too heavy: ${emptyTypography.fontWeight}`);
  }
  if (process.env.VANTA_DESKTOP_EMPTY_SCREENSHOT) {
    await page.screenshot({ path: process.env.VANTA_DESKTOP_EMPTY_SCREENSHOT });
  }
  await page.locator(".session-sidebar").getByRole("button", { name: "New task" }).click();
  await page.getByRole("dialog", { name: "Start a new task" }).getByRole("button", { name: "Create and run" }).click();
  await page.locator(".composer").waitFor();
  await page.getByPlaceholder("Ask Vanta to do something...").waitFor();
  const healthy = await measure(page);
  assertLayout(healthy, "healthy");
  if (process.env.VANTA_DESKTOP_SHELL_SCREENSHOT) {
    await page.screenshot({ path: process.env.VANTA_DESKTOP_SHELL_SCREENSHOT });
  }
  await page.locator(".app-titlebar").getByRole("button", { name: "Close inspector" }).click();
  const inspectorClosed = await measure(page);
  assertLayout(inspectorClosed, "inspector closed");
  await page.locator(".app-titlebar").getByRole("button", { name: "Open contextual inspector" }).click();
  await page.locator(".composer").getByTitle("Change model").click();
  const modelDesktop = await measureModelPicker(page);
  assertModelPicker(modelDesktop, "desktop");
  if (process.env.VANTA_DESKTOP_MODEL_SCREENSHOT) {
    await page.screenshot({ path: process.env.VANTA_DESKTOP_MODEL_SCREENSHOT });
  }
  await page.getByRole("dialog", { name: "Choose a model" }).getByRole("button", { name: "Close model picker" }).click();

  await page.route("**/api/status", (route) => route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ error: "Forced layout recovery fixture" }),
  }));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("alert").waitFor();
  const recovery = await measure(page);
  assertLayout(recovery, "recovery");

  await page.unroute("**/api/status");
  await page.route("**/api/files", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(Array.from({ length: 220 }, (_, index) => `src/a-very-long-project-folder/feature-${index}/implementation-with-a-long-name.ts`)),
  }));
  await page.setViewportSize({ width: 760, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });
  // The composer owns the file-context entry point and opens the inspector in
  // either initial state, so the proof does not depend on a stale tray toggle.
  await page.getByRole("button", { name: "Attach project files" }).click();
  await page.locator(".files-panel").waitFor();
  await page.locator(".file-list button").first().waitFor();
  const files = await measureFiles(page);
  assertFiles(files);

  await page.setViewportSize({ width: 640, height: 900 });
  await page.keyboard.press("Meta+K");
  await page.getByRole("dialog", { name: "Command palette" }).getByRole("button", { name: "Model picker" }).click();
  const modelCompact = await measureModelPicker(page);
  assertModelPicker(modelCompact, "compact");

  if (process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT) {
    await page.screenshot({ path: process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT });
  }
  console.log(JSON.stringify({ viewport: "1778x1136", emptyTypography, healthy, inspectorClosed, modelDesktop, recovery, files, modelCompact }));
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}

async function measureModelPicker(page) {
  const dialog = page.getByRole("dialog", { name: "Choose a model" });
  await dialog.waitFor();
  await dialog.locator(".model-row").first().waitFor();
  return dialog.evaluate((element) => {
    const box = (target) => {
      const rect = target.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height };
    };
    const body = element.querySelector(".model-picker-body");
    const detail = element.querySelector(".model-provider-detail");
    const custom = element.querySelector(".custom-model-disclosure");
    const rows = [...element.querySelectorAll(".model-row")].slice(0, 8);
    const names = [...element.querySelectorAll(".model-name")].slice(0, 8);
    if (!body || !detail || !custom || rows.length === 0 || names.length === 0) throw new Error("Model picker fixture did not render");
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      dialog: box(element), body: box(body), detail: box(detail), custom: box(custom),
      widths: [element.clientWidth, element.scrollWidth, detail.clientWidth, detail.scrollWidth],
      rowHeights: rows.map((row) => box(row).height),
      nameHeights: names.map((name) => box(name).height),
      providers: element.querySelectorAll(".model-provider-nav button").length,
      models: element.querySelectorAll(".model-row").length,
    };
  });
}

async function measureFiles(page) {
  return page.evaluate(() => {
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const rail = document.querySelector(".right-rail");
    const heading = document.querySelector(".inspector-tabs");
    const panel = document.querySelector(".files-panel");
    const list = document.querySelector(".file-list");
    const rows = [...document.querySelectorAll(".file-list button")].slice(0, 5);
    if (!rail || !heading || !panel || !list || rows.length === 0) throw new Error("Files panel fixture did not render");
    return {
      railDisplay: getComputedStyle(rail).display,
      rail: box(rail), heading: box(heading), panel: box(panel), list: box(list),
      panelWidths: [panel.clientWidth, panel.scrollWidth],
      listWidths: [list.clientWidth, list.scrollWidth],
      rowHeights: rows.map((row) => box(row).height),
    };
  });
}

async function measure(page) {
  return page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentScrollHeight: document.documentElement.scrollHeight,
      hasRail: !!document.querySelector(".right-rail"),
      root: box("#root"),
      shell: box(".app-shell"),
      titlebar: box(".app-titlebar"),
      workbench: box(".workbench"),
      stage: box(".conversation-stage"),
      thread: box(".chat-thread"),
      composer: box(".composer"),
    };
  });
}

function assertLayout(result, label) {
  const tolerance = 1;
  if (result.documentScrollWidth > result.viewportWidth + tolerance) throw new Error(`${label}: document scrolls horizontally`);
  if (result.documentScrollHeight > result.viewportHeight + tolerance) throw new Error(`${label}: document scrolls`);
  if (result.root.right < result.viewportWidth - tolerance) throw new Error(`${label}: root leaves empty right gutter`);
  if (result.shell.right < result.viewportWidth - tolerance) throw new Error(`${label}: shell leaves empty right gutter`);
  if (result.titlebar.right < result.viewportWidth - tolerance) throw new Error(`${label}: titlebar leaves empty right gutter`);
  if (result.workbench.right < result.shell.right - tolerance && !result.hasRail) throw new Error(`${label}: workbench leaves empty right gutter without inspector`);
  if (result.shell.bottom > result.viewportHeight + tolerance) throw new Error(`${label}: shell exceeds viewport`);
  if (result.composer.top < 0 || result.composer.bottom > result.viewportHeight + tolerance) throw new Error(`${label}: composer is clipped`);
  if (result.stage.bottom > result.composer.top + tolerance) throw new Error(`${label}: conversation overlaps composer`);
  if (result.thread.bottom > result.stage.bottom + tolerance) throw new Error(`${label}: chat exceeds conversation stage`);
}

function assertFiles(result) {
  if (result.railDisplay !== "grid") throw new Error(`files: inspector uses ${result.railDisplay}, expected grid`);
  if (result.panel.top < result.heading.bottom - 1) throw new Error("files: panel overlaps heading");
  if (result.panelWidths[1] > result.panelWidths[0]) throw new Error("files: panel scrolls horizontally");
  if (result.listWidths[1] > result.listWidths[0]) throw new Error("files: list scrolls horizontally");
  if (result.rowHeights.some((height) => height < 27)) throw new Error(`files: clipped rows ${result.rowHeights.join(",")}`);
}

function assertModelPicker(result, label) {
  const tolerance = 1;
  if (result.dialog.left < -tolerance || result.dialog.right > result.viewport.width + tolerance) throw new Error(`${label} model picker exceeds viewport width`);
  if (result.dialog.top < -tolerance || result.dialog.bottom > result.viewport.height + tolerance) throw new Error(`${label} model picker exceeds viewport height`);
  if (result.widths[1] > result.widths[0] + tolerance) throw new Error(`${label} model picker scrolls horizontally`);
  if (result.widths[3] > result.widths[2] + tolerance) throw new Error(`${label} model detail scrolls horizontally`);
  if (result.custom.bottom > result.dialog.bottom + tolerance) throw new Error(`${label} custom model control is clipped`);
  if (result.custom.height < 32) throw new Error(`${label} custom model disclosure collapsed to ${result.custom.height}px`);
  if (result.rowHeights.some((height) => height < 44)) throw new Error(`${label} model rows collapsed: ${result.rowHeights.join(",")}`);
  if (result.nameHeights.some((height) => height < 14)) throw new Error(`${label} model labels are clipped: ${result.nameHeights.join(",")}`);
  if (result.providers < 1 || result.models < 1) throw new Error(`${label} model picker has no selectable provider/model`);
}
