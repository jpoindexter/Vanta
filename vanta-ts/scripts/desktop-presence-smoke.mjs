import { _electron as electron } from "playwright-core";

const port = process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7819";
const app = await electron.launch({ args: ["desktop-app/electron/main.mjs"], cwd: process.cwd(), env: { ...process.env, VANTA_DESKTOP_PORT: port, VANTA_DESKTOP_SMOKE_EXPOSE_TRAY: "1", ELECTRON_DISABLE_SECURITY_WARNINGS: "1" } });
try {
  const page = await app.firstWindow();
  await page.getByText("Vanta Desktop").waitFor({ timeout: 15_000 });
  const info = await page.evaluate(() => fetch("/api/companion/info").then((response) => response.json()));
  const lifecycle = await app.evaluate(async ({ app, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const tray = globalThis.__vantaTrayController; await tray.refresh(); await tray.openQuick();
    const quickVisible = BrowserWindow.getAllWindows().some((item) => item.webContents.getURL().includes("/companion") && item.isVisible());
    window.close();
    await new Promise((resolve) => setTimeout(resolve, 250));
    return { appReady: app.isReady(), windows: BrowserWindow.getAllWindows().length, mainVisible: window.isVisible(), quickVisible, trayPresent: !!tray.tray };
  });
  if (!info.enabled || !lifecycle.appReady || lifecycle.windows < 1 || lifecycle.mainVisible || !lifecycle.quickVisible || !lifecycle.trayPresent) throw new Error(`presence failed: ${JSON.stringify({ info, lifecycle })}`);
  console.log(JSON.stringify({ companionEnabled: info.enabled, advertisedUrls: info.urls.length, trayKeepsAppAlive: true, mainHidden: true, quickAskVisible: true, trayPresent: true }));
} finally { await app.close(); }
