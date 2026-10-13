// Screenshots of the native capabilities in the real UI (hidden window, real server, scripted model):
// Files pane, Review pane, terminal with an approval card, sidebar rows with status glyphs,
// the project chip menu and the mini window. Light and dark at 1440, light at 1100.
//
//   node tools/shoot-native.mjs [outDir]       (default docs/proofs/restore)
import fs from "node:fs";
import path from "node:path";

import { launchVanta, waitForShell } from "./vanta-app.mjs";
import { startChat, goHome, waitUntil } from "./proof/kit.mjs";
import { installNativeStubs, makeSecondProject } from "./proof/native-stubs.mjs";
import { dirtyProject } from "./proof/rows-right.mjs";
import { seedSessions } from "./proof/seed.mjs";

const out = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", "docs", "proofs", "restore"));
const RUNS = [
  ["light", 1440, 900],
  ["dark", 1440, 900],
  ["light", 1100, 800]
];

const app = await launchVanta({ hidden: true, seed: seedSessions });
const { page } = app;
const settle = (ms = 600) => page.waitForTimeout(ms);
let shots = 0;

const shoot = async (name, mode, w) => {
  fs.mkdirSync(out, { recursive: true });
  await page.screenshot({ path: path.join(out, `${name}-${mode}-${w}.png`), scale: "css" });
  shots += 1;
};
const escape = async () => {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await settle(200);
};
const toggle = (id) => page.getByTestId(`titlebar-${id}`);
const sidebar = () => page.locator('[data-tour="sessions-sidebar"]').first();

async function setMode(mode) {
  await page.evaluate((value) => localStorage.setItem("hermes-desktop-mode-v1", value), mode);
  await page.reload();
  await waitForShell(page);
  await settle(2500);
}

async function openChat(title) {
  await goHome(page);
  await sidebar().getByText(title, { exact: true }).first().click();
  await settle(900);
}

async function closePanes() {
  for (const id of ["changes", "files", "terminal"]) {
    if ((await toggle(id).getAttribute("aria-pressed")) === "true") await toggle(id).click();
  }
  await settle(400);
}

async function filesAndReview(mode, w) {
  await openChat("Say hello");
  await closePanes();
  await toggle("files").click();
  await settle(1200);
  await page.getByText("src", { exact: true }).last().click();
  await settle(700);
  await shoot("native-files", mode, w);
  await toggle("files").click();
  await toggle("changes").click();
  await settle(1800);
  await shoot("native-review", mode, w);
  await toggle("changes").click();
  await settle(400);
}

async function terminalWithCard(mode, w) {
  await openChat("Say hello");
  await closePanes();
  await toggle("terminal").click();
  await settle(1200);
  if ((await page.locator(".xterm").count()) === 0) await page.keyboard.press("Control+Shift+`");
  await settle(800);
  await page.locator(".xterm").first().click({ force: true });
  await page.keyboard.type("echo native terminal");
  await page.keyboard.press("Enter");
  await settle(2500);
  await page.keyboard.type("curl -s http://127.0.0.1:9/");
  await page.keyboard.press("Enter");
  await page.getByText("Run a command").first().waitFor({ timeout: 12_000 });
  await settle(600);
  await shoot("native-terminal-approval", mode, w);
  await page.getByRole("button", { name: "Reject" }).first().click();
  await settle(1200);
  await toggle("terminal").click();
  await settle(400);
}

async function statusRows(mode, w) {
  await closePanes();
  const send = async (text) => {
    await goHome(page);
    const input = page.getByTestId("home-composer-input");
    await input.fill(text);
    await input.press("Enter");
    await settle(1500);
  };
  await send(`slow ${mode} run`);
  await send(`shell: curl -s http://127.0.0.1:9/`);
  await goHome(page);
  await send(`fail ${mode}`);
  await goHome(page);
  await waitUntil(async () => (await sidebar().locator('[role="status"][aria-label="Waiting for you"]').count()) > 0, 8000, 400);
  await settle(600);
  await shoot("native-sidebar-status", mode, w);
  // Clear the approval so the next scene starts clean.
  await sidebar().getByText("shell: curl -s http://127.0.0.1:9/", { exact: true }).first().click();
  await settle(900);
  await page.getByRole("button", { name: "Reject" }).first().click().catch(() => undefined);
  await settle(800);
}

async function projectChip(mode, w) {
  await openChat("Say hello");
  await page.getByTestId("titlebar-project-chip").click();
  await settle(500);
  await shoot("native-project-chip-menu", mode, w);
  await escape();
}

async function miniWindow(mode, w) {
  await goHome(page);
  await toggle("hud").click();
  await waitUntil(async () => (await app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((win) => /win=hud/.test(win.webContents.getURL())).length)) > 0, 8000);
  await settle(1500);
  // The mini window is off-screen and transparent in a hidden run; capture its own contents.
  const png = await app.app.evaluate(async ({ BrowserWindow }) => {
    const hud = BrowserWindow.getAllWindows().find((win) => /win=hud/.test(win.webContents.getURL()));
    const image = await hud.webContents.capturePage();
    return image.toPNG().toString("base64");
  });
  fs.writeFileSync(path.join(out, `native-mini-window-${mode}-${w}.png`), Buffer.from(png, "base64"));
  shots += 1;
  await toggle("hud").click();
  await settle(600);
}

try {
  await waitForShell(page);
  await settle(6000);
  const second = makeSecondProject(app.root);
  await installNativeStubs(app, { confirm: true, downloadDir: app.root, pickFolder: second });
  await startChat(page);
  dirtyProject(app.project);
  for (const [mode, w, h] of RUNS) {
    await setMode(mode);
    await app.resize(w, h);
    await settle(800);
    await filesAndReview(mode, w);
    await terminalWithCard(mode, w);
    await statusRows(mode, w);
    await projectChip(mode, w);
    if (w === 1440) await miniWindow(mode, w);
  }
  console.log(`${shots} screenshots in ${out}`);
} catch (error) {
  console.error("shoot-native stopped:", error.message);
  await page.screenshot({ path: path.join(out, "_native-failure.png") }).catch(() => undefined);
  process.exitCode = 1;
}
console.log("renderer errors:", app.errors.length);
await app.close();
