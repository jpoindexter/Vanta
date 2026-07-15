import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright-core";

const home = await mkdtemp(join(tmpdir(), "vanta-desktop-devtools-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-devtools-profile-"));
const project = await mkdtemp(join(tmpdir(), "vanta-desktop-devtools-project-"));
let app;

try {
  await mkdir(join(home, "sessions"), { recursive: true });
  await writeFile(join(project, "README.md"), "# Devtools layout fixture\n", "utf8");
  app = await electron.launch({
    args: ["desktop-app/electron/main.mjs", "--no-companion", "--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      VANTA_HOME: home,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7832",
      VANTA_DESKTOP_AUTOMATION: "1",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "vanta-desktop-smoke-key",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  await app.firstWindow();
  const deadline = Date.now() + 30_000;
  let page;
  while (!page && Date.now() < deadline) {
    page = app.windows().find((candidate) => candidate.url().startsWith("http://127.0.0.1"));
    if (!page) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!page) throw new Error("Vanta renderer window not found");
  await page.locator(".app-shell").waitFor({ timeout: 30_000 });
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().startsWith("http://127.0.0.1"));
    if (!window) throw new Error("Vanta BrowserWindow not found");
    window.webContents.openDevTools({ mode: "detach", activate: false });
    window.setContentSize(900, 700);
  });
  await page.waitForTimeout(200);
  await page.keyboard.press("Meta+K");
  await page.getByRole("dialog", { name: "Command palette" }).waitFor();

  const native = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().startsWith("http://127.0.0.1"));
    if (!window) throw new Error("Vanta BrowserWindow not found");
    return { content: window.getContentBounds(), devtoolsOpen: window.webContents.isDevToolsOpened() };
  });
  const windowUrls = app.windows().map((candidate) => candidate.url());
  const renderer = await page.evaluate(() => {
    const shell = document.querySelector(".app-shell")?.getBoundingClientRect();
    const controls = document.querySelector(".titlebar-leading-actions")?.getBoundingClientRect();
    if (!shell || !controls) throw new Error("Desktop shell fixture did not render");
    return { innerWidth: window.innerWidth, shellWidth: shell.width, controlsLeft: controls.left, brandCount: document.querySelectorAll(".titlebar-brand").length };
  });

  const detachedDevtoolsWindow = windowUrls.some((url) => url.startsWith("devtools://"));
  if (!detachedDevtoolsWindow) throw new Error(`Detached developer tools window did not open: ${JSON.stringify({ native, windowUrls })}`);
  if (Math.abs(native.content.width - renderer.innerWidth) > 1) throw new Error(`Developer tools stole the app viewport: ${JSON.stringify({ native, renderer })}`);
  if (Math.abs(renderer.shellWidth - renderer.innerWidth) > 1) throw new Error(`Desktop shell does not own the full viewport: ${JSON.stringify({ native, renderer })}`);
  if (renderer.controlsLeft < 70 || renderer.brandCount !== 0) throw new Error(`macOS titlebar identity regressed: ${JSON.stringify(renderer)}`);
  if (process.env.VANTA_DESKTOP_DEVTOOLS_SCREENSHOT) await page.screenshot({ path: process.env.VANTA_DESKTOP_DEVTOOLS_SCREENSHOT, fullPage: false });
  console.log(JSON.stringify({ detachedDevtools: true, fullWindowShell: true, trafficLightSafe: true, redundantBrandRemoved: true, native, renderer, windowUrls }));
} finally {
  await app?.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.closeDevTools();
  }).catch(() => undefined);
  await app?.close().catch(() => undefined);
  await Promise.all([
    rm(home, { recursive: true, force: true }),
    rm(userData, { recursive: true, force: true }),
    rm(project, { recursive: true, force: true }),
  ]);
}
