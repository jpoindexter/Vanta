// Compact sidebar labels and forced-colors proof in the isolated source app.
import assert from "node:assert/strict";
import fs from "node:fs";

import { launchVanta, waitForShell } from "../vanta-app.mjs";
import { closeMenus, ensureChat } from "./kit.mjs";
import { seedSessions } from "./seed.mjs";

globalThis.__vantaKeepRoot = true;
const checks = [];
const check = (name, passed) => { assert.ok(passed, name); checks.push(name); };

async function railLabels(ctx) {
  const { page } = ctx;
  await ctx.resize(1100, 900);
  const newChat = page.getByTestId("nav-new-session");
  const tip = (name) => page.getByRole("tooltip", { name, exact: true });
  await newChat.hover();
  await tip("New chat").waitFor();
  check("Compact New chat icon has a hover label", await tip("New chat").isVisible());
  const box = await tip("New chat").boundingBox();
  check("Label extends outside the narrow rail", box.width > 56 && box.x > 40);
  await ctx.shot(`${ctx.root}/rail-hover.png`);
  await page.getByTestId("nav-home").hover();
  await tip("Home").waitFor();
  check("Destination icon has its own hover label", await tip("Home").isVisible());
  await newChat.focus();
  await page.keyboard.press("Tab");
  await tip("Search").waitFor();
  check("Keyboard reveals the Search label", await page.getByTestId("nav-search").evaluate((el) => el === document.activeElement));
  await page.keyboard.press("Escape");
  await tip("Search").waitFor({ state: "hidden", timeout: 3000 });
  check("Escape dismisses the focused label", !(await tip("Search").isVisible()));
}

async function alternateStates(ctx) {
  const { page } = ctx;
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const forced = await page.locator('[data-vp="composer"][data-slot="composer-surface"]').first().evaluate((el) => {
    const style = getComputedStyle(el);
    return { color: style.borderColor, width: style.borderWidth, shadow: style.boxShadow };
  });
  check("Forced colors retains the composer boundary", forced.width === "1px" && forced.color !== "rgba(0, 0, 0, 0)");
  await ctx.shot(`${ctx.root}/rail-forced-colors.png`);
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  await ctx.resize(1440, 900);
  const row = page.locator('[data-testid="sidebar-row"]').filter({ hasText: "Pinned: launch checklist" }).first();
  await row.hover();
  await row.getByRole("button", { name: "Session actions", exact: true }).click();
  await page.getByRole("menu").first().waitFor();
  check("Horizontal ellipsis opens the existing menu", await page.getByRole("menu").first().isVisible());
  await ctx.shot(`${ctx.root}/row-menu.png`);
  await closeMenus(page);
  return forced;
}

const ctx = await launchVanta({ hidden: true, seed: seedSessions });
try {
  await waitForShell(ctx.page);
  await ensureChat(ctx.page);
  await railLabels(ctx);
  const forced = await alternateStates(ctx);
  const report = { root: ctx.root, checks, forced, rendererErrors: ctx.errors };
  fs.writeFileSync(`${ctx.root}/rail-review.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ root: ctx.root, checks, error: String(error) })}\n`);
  throw error;
} finally {
  await ctx.close();
}
