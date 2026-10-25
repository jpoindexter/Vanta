// Source-app review only: isolated profile, scripted model, no installed-app changes.
import assert from "node:assert/strict";
import fs from "node:fs";

import { launchVanta, waitForShell } from "../vanta-app.mjs";
import { closeMenus, ensureChat, results } from "./kit.mjs";
import { installNativeStubs, makeSecondProject } from "./native-stubs.mjs";
import { attachRows } from "./rows-composer.mjs";
import { seedSessions } from "./seed.mjs";

globalThis.__vantaKeepRoot = true;
const checks = [];
const shots = [];
const surface = (page) => page.locator('[data-slot="composer-surface"][data-vp="composer"]').first();

function check(name, passed) {
  assert.ok(passed, name);
  checks.push(name);
}

async function shot(ctx, name) {
  const file = `${ctx.root}/${name}.png`;
  await ctx.shot(file);
  shots.push(file);
}

async function checkPaint(ctx) {
  const { page } = ctx;
  const paint = await surface(page).evaluate((el) => {
    const style = getComputedStyle(el);
    const backing = el.querySelector(".pointer-events-none.absolute.inset-0");
    return { radius: style.borderRadius, shadow: style.boxShadow, border: style.borderColor, fill: getComputedStyle(backing).backgroundColor };
  });
  check("Composer radius follows the 22px wireframe", paint.radius === "22px");
  check("Composer has layered elevation", paint.shadow !== "none" && paint.shadow.includes(","));
  check("Resting composer has no dark border", paint.border === "rgba(0, 0, 0, 0)");
  check("Composer backing is opaque white", paint.fill === "rgb(255, 255, 255)");
  check("Sidebar has its scoped edge elevation", await page.locator('[data-tour="sessions-sidebar"]').first().evaluate((el) => getComputedStyle(el).boxShadow !== "none"));
  await shot(ctx, "01-chat-light");
  return paint;
}

async function checkRow(ctx) {
  const { page } = ctx;
  const row = page.locator('[data-testid="sidebar-row"]').filter({ hasText: "Pinned: launch checklist" }).first();
  const before = (await row.boundingBox()).width;
  await row.getByTestId("sidebar-row-title").focus();
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Session actions");
  check("Tab reaches the row menu, not an invisible timestamp", await row.getByRole("button", { name: "Session actions", exact: true }).evaluate((el) => el === document.activeElement));
  check("Keyboard reveal preserves row width", Math.abs((await row.boundingBox()).width - before) < 1);
  await page.keyboard.press("Space");
  await page.getByRole("menu").first().waitFor();
  check("Keyboard opens the real session actions menu", await page.getByRole("menu").first().isVisible());
  await shot(ctx, "02-sidebar-keyboard-menu");
  await closeMenus(page);
  await row.hover();
  check("Pointer hover exposes the same action", await row.getByRole("button", { name: "Session actions", exact: true }).isVisible());
}

async function checkComposer(ctx) {
  const { page } = ctx;
  await page.keyboard.press("Tab");
  await page.locator('[data-vp="chip-model"]').first().focus();
  check("Composer model control has a keyboard focus ring", await page.locator('[data-vp="chip-model"]').first().evaluate((el) => getComputedStyle(el).outlineWidth === "2px"));
  await page.locator('[data-vp="chip-model"]').first().click();
  await page.getByRole("menu").first().waitFor();
  check("Model menu still opens", await page.getByRole("menu").first().isVisible());
  await closeMenus(page);
  await page.locator('[data-vp="chip-permission"]').first().click();
  await page.getByRole("menu").first().waitFor();
  check("Permission menu still opens without changing authority", await page.getByRole("menu").first().isVisible());
  await closeMenus(page);
  const input = page.locator('[data-slot="composer-rich-input"]').first();
  await input.fill("Review the latest competitor notes and prepare a short research brief.");
  await shot(ctx, "03-composer-draft");
  check("Draft remains editable", (await input.innerText()).includes("competitor notes"));
  await input.fill("");
  await page.getByTestId("nav-new-session").click();
  await page.waitForFunction(() => document.querySelector('[data-vanta-titlebar]')?.textContent.includes("New chat"));
  check("New chat opens the real draft composer", await page.locator('[data-vp="composer-input"]').first().isVisible());
  await shot(ctx, "04-new-chat-light");
  await ensureChat(page);
}

async function checkNarrowAndDark(ctx) {
  const { page } = ctx;
  await ctx.resize(800, 900);
  const box = await surface(page).boundingBox();
  const send = await page.locator('[data-vp="composer-send"]').first().boundingBox();
  check("Composer fits an 800px window", box.x >= 0 && box.x + box.width <= 801);
  check("Send stays inside the narrow composer", send.x >= box.x && send.x + send.width <= box.x + box.width + 1);
  await shot(ctx, "05-chat-narrow");
  await ctx.resize(1440, 900);
  await page.evaluate(() => localStorage.setItem("vanta-desktop-mode-v1", "dark"));
  await page.reload();
  await waitForShell(page);
  await ensureChat(page);
  check("Actual theme switches to dark", (await page.locator("html").getAttribute("data-vanta-mode")) === "dark");
  check("Dark composer retains elevation", await surface(page).evaluate((el) => getComputedStyle(el).boxShadow !== "none"));
  await shot(ctx, "06-chat-dark");
}

const ctx = await launchVanta({ hidden: true, seed: seedSessions });
try {
  await waitForShell(ctx.page);
  await ensureChat(ctx.page);
  check("New chat reuses localized copy", (await ctx.page.getByTestId("nav-new-session").innerText()).includes("New chat"));
  const paint = await checkPaint(ctx);
  await checkRow(ctx);
  await checkComposer(ctx);
  const second = makeSecondProject(ctx.root);
  await installNativeStubs(ctx, { confirm: true, downloadDir: ctx.root, pickFolder: second });
  await attachRows({ ...ctx, app: ctx, second });
  for (const id of ["F-115", "F-116", "F-118"]) check(`${id} attachment regression: ${results.get(id)?.note}`, results.get(id)?.result === "PASS");
  await checkNarrowAndDark(ctx);
  const report = { checks, paint, shots, root: ctx.root, rendererErrors: ctx.errors };
  fs.writeFileSync(`${ctx.root}/review-results.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ root: ctx.root, checks, shots, rows: [...results.values()], error: String(error) })}\n`);
  throw error;
} finally {
  await ctx.close();
}
