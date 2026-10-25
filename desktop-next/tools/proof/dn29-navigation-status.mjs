// Source-app proof: private data, scripted model, no installed app or real account.
import assert from "node:assert/strict";
import fs from "node:fs";

import { launchVanta, waitForShell } from "../vanta-app.mjs";
import { closeMenus, ensureChat } from "./kit.mjs";
import { seedSessions } from "./seed.mjs";

globalThis.__vantaKeepRoot = true;
const checks = [];
const shots = [];
function check(name, ok) { assert.ok(ok, name); checks.push(name); }
async function shot(ctx, name) {
  const path = `${ctx.root}/${name}.png`;
  await ctx.shot(path);
  shots.push(path);
}
async function navigation(ctx) {
  const { page } = ctx;
  const toggle = page.getByTestId("nav-tools");
  check("Supporting destinations start collapsed in a chat", await toggle.getAttribute("aria-expanded") === "false");
  check("New chat, Home and Outputs stay directly visible", (await Promise.all(["new-session", "home", "artifacts"].map(id => page.getByTestId(`nav-${id}`).isVisible()))).every(Boolean));
  await shot(ctx, "01-chat-quiet-navigation");
  await toggle.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  check("Navigation disclosure has a visible keyboard ring", await toggle.evaluate(el => getComputedStyle(el).outlineWidth === "2px"));
  await page.keyboard.press("Enter");
  for (const route of ["messaging", "capabilities", "cron", "company"]) {
    await page.getByTestId(`nav-${route}`).click();
    await page.waitForFunction(path => location.hash.includes(`/${path}`), route);
    check(`${route} still opens its real route`, await toggle.getAttribute("aria-expanded") === "true");
  }
  await page.getByTestId("nav-new-session").click();
  check("New chat reaches an editable composer without a task form", await page.locator('[data-vp="composer-input"]').first().isVisible());
  await ensureChat(page);
  await toggle.click();
  check("Supporting navigation can collapse again", await toggle.getAttribute("aria-expanded") === "false");
}
async function status(ctx) {
  const { page } = ctx;
  const bar = page.locator('[data-slot="statusbar"]');
  const trigger = page.getByTestId("statusbar-details");
  check("Status bar keeps health and project visible", await bar.getByTestId("statusbar-gateway-health").isVisible() && await bar.getByTestId("statusbar-workspace-cwd").isVisible());
  check("Routine diagnostics no longer crowd the strip", !/Focused for|\d+k\/|v0\.0\.0|Smart|Cron/.test(await bar.innerText()));
  await trigger.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByTestId("statusbar-details-panel");
  await panel.waitFor();
  check("Details uses visible labels instead of autofocus tooltips", await page.getByRole("tooltip").count() === 0);
  for (const id of ["agents", "cron", "context-usage", "approval-mode", "terminal", "version-client"]) {
    check(`${id} remains accessible in Details`, await panel.getByTestId(`statusbar-${id}`).isVisible());
  }
  await shot(ctx, "02-status-details");
  await panel.getByTestId("statusbar-context-usage").click();
  check("Details retains the actual context-usage menu", await page.getByTestId("statusbar-context-usage").getAttribute("aria-expanded") === "true");
  await page.keyboard.press("Escape");
  await page.getByRole("menu").first().waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "statusbar-context-usage", null, { timeout: 5000 });
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "statusbar-details", null, { timeout: 5000 });
  check("Escape restores focus to Details", await trigger.evaluate(el => el === document.activeElement));
  await bar.click({ button: "right" });
  check("Existing customization remains reachable", await page.getByRole("menuitemcheckbox").count() > 0);
  await closeMenus(page);
}
async function layouts(ctx) {
  const { page } = ctx;
  await ctx.resize(800, 900);
  const box = await page.getByTestId("statusbar-details").boundingBox();
  check("Details fits an 800px window", box && box.x >= 0 && box.x + box.width <= 801);
  await shot(ctx, "03-narrow");
  await ctx.resize(1100, 900);
  check("Compact rail retains Connections", await page.getByTestId("nav-messaging").isVisible());
  await ctx.resize(1440, 900);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => localStorage.setItem("vanta-desktop-mode-v1", "dark"));
  await page.reload();
  await waitForShell(page);
  check("Dark theme keeps Details usable", await page.getByTestId("statusbar-details").isVisible());
  await shot(ctx, "04-dark");
}
const ctx = await launchVanta({ hidden: true, seed: seedSessions, extraEnv: { VANTA_DESKTOP_RESPAWN_DELAY_MS: "30000" } });
try {
  await waitForShell(ctx.page);
  await ensureChat(ctx.page);
  await navigation(ctx);
  await status(ctx);
  await layouts(ctx);
  const report = { checks, shots, root: ctx.root, rendererErrors: ctx.errors };
  fs.writeFileSync(`${ctx.root}/navigation-status-review.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  const focus = await ctx.page.evaluate(() => document.activeElement?.outerHTML).catch(() => null);
  process.stderr.write(`${JSON.stringify({ checks, shots, root: ctx.root, focus, error: String(error) })}\n`);
  throw error;
} finally { await ctx.close(); }
