// Source-app visual/interaction review only; no owner profile or installed app.
import assert from "node:assert/strict";
import fs from "node:fs";

import { launchVanta, waitForShell } from "../vanta-app.mjs";
import { closeMenus, ensureChat, results, startChat } from "./kit.mjs";
import { approvalRows } from "./rows-thread.mjs";
import { seedSessions } from "./seed.mjs";

globalThis.__vantaKeepRoot = true;
const checks = [];
const shots = [];
function check(name, passed) {
  assert.ok(passed, name);
  checks.push(name);
}
async function shot(ctx, name) {
  const file = `${ctx.root}/${name}.png`;
  await ctx.shot(file);
  shots.push(file);
}
async function titlebar(ctx) {
  const { page } = ctx;
  const bar = page.locator("[data-vanta-titlebar]");
  check("Titlebar retains the native 44px drag region", await bar.evaluate(el => el.offsetHeight === 44 && getComputedStyle(el).webkitAppRegion === "drag"));
  check("Resting icon controls have transparent boundaries", await bar.locator(".vs-icon").evaluateAll(els => els.every(el => getComputedStyle(el).borderColor === "rgba(0, 0, 0, 0)")));
  check("Advanced window controls are not duplicated on the bar", await page.getByTestId("titlebar-tools").getByRole("button").count() === 1);
  for (const id of ["changes", "terminal", "browser", "files"]) {
    check(`${id} stays directly reachable`, await page.getByTestId(`titlebar-${id}`).isVisible());
  }
  await page.getByTestId("titlebar-more").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  check("More has a visible keyboard focus ring", await page.getByTestId("titlebar-more").evaluate(el => getComputedStyle(el).outlineWidth === "2px"));
  await page.keyboard.press("Space");
  await page.getByTestId("more-menu").waitFor();
  for (const id of ["settings", "layout", "flip-panes", "right-sidebar", "hud"]) {
    check(`${id} is reachable in the keyboard-opened More menu`, await page.getByTestId(`more-${id}`).isVisible());
  }
  await shot(ctx, "01-titlebar-menu");
  await closeMenus(page);
  await page.getByTestId("titlebar-project-chip").click();
  check("Project actions remain accessible", await page.getByTestId("project-copy-path").isVisible());
  await closeMenus(page);
}
async function transcript(ctx) {
  const { page } = ctx;
  await startChat(page, "long research brief", "That is the end of the long reply.");
  const column = page.locator('[data-slot="aui_thread-content"][data-vp="column"]').first();
  check("Transcript retains its bounded reading column", await column.evaluate(el => getComputedStyle(el).maxWidth === "720px"));
  const bubble = page.locator('[data-slot="aui_user-message-root"]').first();
  check("User messages remain visually distinct", await bubble.evaluate(el => getComputedStyle(el).maxWidth === "85%"));
  check("Reply preserves list and code formatting", await column.locator("pre").count() > 0 && await column.locator("li").count() >= 3);
  await shot(ctx, "02-transcript-light");
  await page.getByText("That is the end of the long reply.", { exact: false }).first().hover();
  const copy = page.getByRole("button", { name: "Copy", exact: true }).last();
  await copy.click();
  check("Assistant copy still copies the actual reply", /That is the end/.test(await page.evaluate(() => window.desktopBridge.readClipboard())));
  await startChat(page, "shell: echo titlebar-thread-proof", "Done. The command finished");
  check("Real sandbox tool activity remains visible", /shell cmd|Running shell|echo titlebar-thread-proof/i.test(await column.innerText()));
  await shot(ctx, "03-tool-activity");
  const step = page.locator('.vp-step[aria-expanded]').first();
  await step.click();
  check("Tool details still expand", await step.getAttribute("aria-expanded") === "true");
  await step.click();
  check("Tool details still collapse", await step.getAttribute("aria-expanded") === "false");
}
async function themes(ctx) {
  const { page } = ctx;
  await ctx.resize(800, 900);
  for (const id of ["new-chat", "more", "terminal"]) {
    const box = await page.getByTestId(`titlebar-${id}`).boundingBox();
    check(`${id} fits the narrow titlebar`, box && box.x >= 0 && box.x + box.width <= 801);
  }
  await shot(ctx, "04-narrow");
  await ctx.resize(1440, 900);
  await page.evaluate(() => localStorage.setItem("vanta-desktop-mode-v1", "dark"));
  await page.reload();
  await waitForShell(page);
  await ensureChat(page);
  check("Dark theme uses the real stored preference", await page.locator("html").getAttribute("data-vanta-mode") === "dark");
  await shot(ctx, "05-dark");
}

const ctx = await launchVanta({ hidden: true, seed: seedSessions });
try {
  await waitForShell(ctx.page);
  await ensureChat(ctx.page);
  await titlebar(ctx);
  await transcript(ctx);
  await approvalRows(ctx);
  check(`Exact-action approval retains all three choices: ${results.get("F-145")?.note}`, results.get("F-145")?.result === "PASS");
  await shot(ctx, "04-after-rejected-approval");
  await themes(ctx);
  const report = { checks, shots, root: ctx.root, rendererErrors: ctx.errors };
  fs.writeFileSync(`${ctx.root}/titlebar-thread-review.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ root: ctx.root, checks, shots, error: String(error) })}\n`);
  throw error;
} finally {
  await ctx.close();
}
