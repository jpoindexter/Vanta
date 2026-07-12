import { _electron as electron } from "playwright-core";
import { resolve } from "node:path";

const port = process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7821";
const executablePath = process.env.VANTA_DESKTOP_APP;
const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: executablePath ? ["--project", resolve(process.cwd(), "..")] : ["desktop-app/electron/main.mjs"],
  cwd: process.cwd(),
  env: { ...process.env, VANTA_DESKTOP_PORT: port, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
});

try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1778, height: 1136 });
  await page.getByRole("heading", { name: "New session" }).waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "New session" }).click();
  await page.getByRole("heading", { name: "What should Vanta handle?" }).waitFor();
  const healthy = await measure(page);
  assertLayout(healthy, "healthy");

  await page.route("**/api/status", (route) => route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ error: "Forced layout recovery fixture" }),
  }));
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("alert").waitFor();
  const recovery = await measure(page);
  assertLayout(recovery, "recovery");

  if (process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT) {
    await page.screenshot({ path: process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT });
  }
  console.log(JSON.stringify({ viewport: "1778x1136", healthy, recovery }));
} finally {
  await app.close();
}

async function measure(page) {
  return page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height };
    };
    return {
      viewportHeight: window.innerHeight,
      documentScrollHeight: document.documentElement.scrollHeight,
      shell: box(".app-shell"),
      stage: box(".conversation-stage"),
      thread: box(".chat-thread"),
      composer: box(".composer"),
    };
  });
}

function assertLayout(result, label) {
  const tolerance = 1;
  if (result.documentScrollHeight > result.viewportHeight + tolerance) throw new Error(`${label}: document scrolls`);
  if (result.shell.bottom > result.viewportHeight + tolerance) throw new Error(`${label}: shell exceeds viewport`);
  if (result.composer.top < 0 || result.composer.bottom > result.viewportHeight + tolerance) throw new Error(`${label}: composer is clipped`);
  if (result.stage.bottom > result.composer.top + tolerance) throw new Error(`${label}: conversation overlaps composer`);
  if (result.thread.bottom > result.stage.bottom + tolerance) throw new Error(`${label}: chat exceeds conversation stage`);
}
