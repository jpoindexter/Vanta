import { _electron as electron } from "playwright-core";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const basePort = Number(process.env.VANTA_DESKTOP_FULL_ACCESS_PORT ?? "7824");
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-full-access-"));
const restartUserData = await mkdtemp(join(tmpdir(), "vanta-desktop-full-access-restart-"));
let accessMode = "approve";
let projectRoot = "/fixture/project-one";
let activeUserData = userData;
let app;

try {
  let page = await launch();
  await seedStaleAcknowledgement(page);
  await selectMode(page, "Full access", "full");
  const dark = await inspectWarning(page, "dark");
  await proveKeyboardControls(page);
  await page.getByRole("button", { name: "Close full access warning" }).click();
  await expectNoWarning(page);
  await page.locator(".approval-mode").getByText("Full access", { exact: true }).waitFor();
  const blocked = await proveKernelBlock(page);

  await page.reload({ waitUntil: "domcontentloaded" });
  const banner = page.getByRole("alert", { name: "Full access is on" });
  await banner.waitFor();
  await banner.getByRole("button", { name: "Don't show again" }).click();
  await expectNoWarning(page);
  const stored = await page.evaluate(() => localStorage.getItem("vanta.desktop.full-access-warning"));
  if (!stored?.includes("2026-07-17.v1") || !stored.includes(projectRoot)) throw new Error(`warning acknowledgement is incomplete: ${stored}`);

  await app.close();
  await delay(1_000);
  await cp(join(userData, "Local Storage"), join(restartUserData, "Local Storage"), { recursive: true });
  activeUserData = restartUserData;
  page = await launch();
  await expectNoWarning(page);
  await resetFromSafetySettings(page);
  await page.getByRole("alert", { name: "Full access is on" }).waitFor();

  await page.getByRole("alert").getByRole("button", { name: "Don't show again" }).click();
  projectRoot = "/fixture/project-two";
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("alert", { name: "Full access is on" }).waitFor();
  await seedStaleAcknowledgement(page);
  const light = await inspectWarning(page, "light");

  const closeInspector = page.locator(".app-titlebar").getByRole("button", { name: "Close inspector" });
  if (await closeInspector.count()) await closeInspector.click();
  await page.setViewportSize({ width: 760, height: 900 });
  await page.locator(".mobile-nav").getByRole("button", { name: "Work" }).click();
  await page.waitForTimeout(250);
  const compact = await page.getByRole("alert", { name: "Full access is on" }).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, bottom: rect.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
  });
  if (compact.left < 0 || compact.right > compact.viewportWidth + 1 || compact.bottom > compact.viewportHeight) throw new Error(`compact warning overflowed: ${JSON.stringify(compact)}`);
  if (process.env.VANTA_DESKTOP_FULL_ACCESS_SCREENSHOT) await page.screenshot({ path: process.env.VANTA_DESKTOP_FULL_ACCESS_SCREENSHOT });
  console.log(JSON.stringify({ ok: true, dark, light, compact, closeCurrent: true, persistedAcrossRestart: true, settingsReset: true, scopeInvalidation: true, versionInvalidation: true, blockedKernel: blocked, keyboard: true }));
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([rm(userData, { recursive: true, force: true }), rm(restartUserData, { recursive: true, force: true })]);
}

async function launch() {
  const port = String(basePort);
  app = await electron.launch({
    args: ["desktop-app/electron/main.mjs"], cwd: process.cwd(),
    env: { ...process.env, VANTA_DESKTOP_PORT: port, VANTA_DESKTOP_USER_DATA: activeUserData, VANTA_DESKTOP_AUTOMATION: "1", OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "vanta-full-access-smoke-key", ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
  });
  const page = await app.firstWindow();
  await page.waitForURL((url) => url.protocol === "http:", { timeout: 20_000 });
  await installRoutes(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".app-shell").waitFor({ timeout: 20_000 });
  if (new URL(page.url()).port !== port) throw new Error(`restart origin changed from ${port}: ${page.url()}`);
  return page;
}

async function installRoutes(page) {
  await page.route("**/api/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ kernel: "online", model: "fixture-model", provider: "openai", tools: 8, sessionId: "fixture-session", root: projectRoot, goals: [], accessMode, accessScope: "project" }) }));
  await page.route("**/api/access-mode", async (route) => {
    if (route.request().method() === "POST") accessMode = route.request().postDataJSON().mode;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: accessMode, scope: "project" }) });
  });
  await page.route("**/api/chat", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ finalText: "Kernel blocked fixture action.", events: [{ label: "Kernel blocked command", ok: false }], interrupted: false }) }));
}

async function selectMode(page, label, expected) {
  await page.locator(".approval-mode").click();
  const menu = page.getByRole("dialog", { name: "Action approval mode" });
  await menu.getByRole("radio", { name: new RegExp(label) }).click();
  if (accessMode !== expected) throw new Error(`access mode did not change to ${expected}`);
  await menu.waitFor({ state: "detached" });
}

async function seedStaleAcknowledgement(page) {
  await page.evaluate(({ root }) => {
    localStorage.setItem("vanta.desktop.full-access-warning", JSON.stringify({ version: "stale-risk-copy", scope: `project:${root}` }));
    localStorage.setItem("vanta.desktop.theme", "dark");
  }, { root: projectRoot });
  await page.reload({ waitUntil: "domcontentloaded" });
}

async function inspectWarning(page, theme) {
  await page.evaluate((next) => localStorage.setItem("vanta.desktop.theme", next), theme);
  await page.reload({ waitUntil: "domcontentloaded" });
  const banner = page.getByRole("alert", { name: "Full access is on" });
  await banner.waitFor();
  for (const text of ["run commands", "use the internet", "delete files", "data loss", "prompt injection", "Kernel-blocked actions remain blocked"]) await banner.getByText(text, { exact: false }).waitFor();
  const visual = await banner.evaluate((element) => {
    const title = element.querySelector("strong");
    const style = getComputedStyle(element);
    const titleStyle = title ? getComputedStyle(title) : style;
    return { role: element.getAttribute("role"), live: element.getAttribute("aria-live"), background: style.backgroundColor, color: titleStyle.color };
  });
  visual.contrast = contrast(visual.color, visual.background);
  if (visual.role !== "alert" || visual.live !== "assertive" || visual.contrast < 4.5) throw new Error(`${theme} warning contract failed: ${JSON.stringify(visual)}`);
  return visual;
}

async function proveKeyboardControls(page) {
  const banner = page.getByRole("alert", { name: "Full access is on" });
  const persist = banner.getByRole("button", { name: "Don't show again" });
  await persist.focus();
  await page.keyboard.press("Tab");
  const label = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  if (label !== "Close full access warning") throw new Error(`warning keyboard order failed: ${label}`);
}

async function proveKernelBlock(page) {
  const composer = page.getByPlaceholder("Ask Vanta to do something...");
  await composer.fill("Run a blocked fixture command");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("Kernel blocked fixture action.", { exact: true }).waitFor();
  return true;
}

async function resetFromSafetySettings(page) {
  await page.locator(".session-sidebar-footer").getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Safety" }).click();
  await settings.getByRole("button", { name: "Show warning again" }).click();
  await settings.getByRole("button", { name: "Close" }).click();
}

async function expectNoWarning(page) {
  if (await page.getByRole("alert", { name: "Full access is on" }).count()) throw new Error("full access warning remained visible");
}

function contrast(foreground, background) {
  const luminance = (value) => {
    const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
    const linear = channels.map((channel) => { const normalized = channel / 255; return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4; });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  };
  const first = luminance(foreground); const second = luminance(background);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}
