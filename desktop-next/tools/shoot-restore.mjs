// Screenshots of the assembled app (real shell, real server, mock model), off-screen:
// new chat, Home, a chat with messages, Settings, command palette, layout editor on,
// sidebar filter menu, Bots tab, at 1440x900, 1100x800 and 800x700, light and dark.
//
//   node tools/shoot-restore.mjs [outDir]       (default docs/proofs/restore)
import path from "node:path";

import { launchVanta, waitForShell } from "./vanta-app.mjs";

const out = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", "docs", "proofs", "restore"));
const SIZES = [
  [1440, 900],
  [1100, 800],
  [800, 700]
];

const app = await launchVanta({ hidden: true });
const { page } = app;
let shots = 0;

const settle = (ms = 500) => page.waitForTimeout(ms);
const escape = async () => {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await settle(200);
};

async function shot(name, w, h, mode) {
  await page.screenshot({ path: path.join(out, `${name}-${mode}-${w}.png`), scale: "css" });
  shots += 1;
}

async function setMode(mode) {
  await page.evaluate((value) => localStorage.setItem("hermes-desktop-mode-v1", value), mode);
  await page.reload();
  await waitForShell(page);
  await settle(2500);
}

async function newChat() {
  await page.getByTestId("titlebar-new-chat").click();
  await settle(900);
}

async function openFirstChat() {
  // The palette opens a chat at every width (the sidebar is a rail or a drawer when narrow).
  await page.keyboard.press("Meta+K");
  await settle(500);
  await page.keyboard.type("Say hello");
  await settle(900);
  await page.keyboard.press("Enter");
  await settle(1200);
}

async function scenes(w, h, mode) {
  await app.resize(w, h);
  await settle(700);
  await page.keyboard.press("Meta+Shift+O");
  await settle(900);
  await shot("home", w, h, mode);

  await newChat();
  await shot("new-chat", w, h, mode);

  await openFirstChat();
  await shot("session", w, h, mode);

  await page.getByTestId("titlebar-settings").click();
  await settle(900);
  await shot("settings", w, h, mode);
  await escape();

  await page.keyboard.press("Meta+K");
  await settle(700);
  await shot("palette", w, h, mode);
  await escape();

  await page.getByTestId("titlebar-layout").click().catch(() => undefined);
  await settle(900);
  await shot("layout-editor", w, h, mode);
  await page.getByTestId("titlebar-layout").click().catch(() => undefined);
  await settle(400);

  const filter = page.locator('[data-tour="sessions-sidebar"]').getByRole("button", { name: /^Filters$/ }).first();
  if (await filter.isVisible().catch(() => false)) {
    await filter.click();
    await settle(500);
    await shot("filter-menu", w, h, mode);
    await escape();
  }

  const bots = page.getByText("Bots", { exact: true }).first();
  if (await bots.isVisible().catch(() => false)) {
    await bots.click();
    await settle(800);
    await shot("bots-tab", w, h, mode);
    await page.getByText("Sessions", { exact: true }).first().click();
    await settle(300);
  }
}

try {
  await waitForShell(page);
  await settle(6000);
  // One chat first so the session scenes have messages.
  await page.locator('[data-tour="sidebar-nav-home"]').click();
  await page.getByTestId("home-composer-input").fill("Say hello");
  await page.getByTestId("home-composer-input").press("Enter");
  await page.getByText("Hello from the proof model", { exact: false }).first().waitFor({ timeout: 60_000 });
  await settle(1500);

  for (const mode of ["light", "dark"]) {
    await setMode(mode);
    for (const [w, h] of SIZES) await scenes(w, h, mode);
  }
  console.log(`${shots} screenshots in ${out}`);
} catch (error) {
  console.error("shoot-restore stopped:", error.message);
  await page.screenshot({ path: path.join(out, "_failure.png") }).catch(() => undefined);
  process.exitCode = 1;
}
console.log("renderer errors:", app.errors.length);
await app.close();
