import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { collectInPage } from "./collect.mjs";
import { ELEMENTS } from "./spec.mjs";

const here = import.meta.dirname;
const require = createRequire(path.join(here, "..", "..", "package.json"));
export const { chromium } = require("playwright-core");

export const WIREFRAME = path.resolve(here, "..", "..", "docs", "wireframe", "vanta-desktop-wireframe.html");
export const MAIN_WIDTH = { 1440: 1165, 1100: 1044, 800: 800 };

export async function openWireframe(browser, { w, theme, state }) {
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 }, colorScheme: theme });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(WIREFRAME).href);
  await page.click(`[data-w="${w}"]`);
  await page.click(`[data-cs="${state}"]`);
  await page.waitForTimeout(150);
  return { page, ctx, mainSel: "#app .main" };
}

export async function openBuilt(browser, { w, theme, state, flags = "", base }) {
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 760 }, colorScheme: theme });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/chat-fixtures.html?state=${state}&theme=${theme}&w=${w}&flags=${flags}`);
  await page.waitForSelector("[data-fixture-main]");
  await page.waitForTimeout(2500);
  return { page, ctx, mainSel: "[data-fixture-main]", errors };
}

/** Measure every spec element that applies to `state`; hover rows are re-read after hovering. */
export async function measureAll(page, mainSel, side, state) {
  const result = {};
  for (const spec of ELEMENTS) {
    if (!spec.states.includes(state)) continue;
    const sel = side === "wf" ? spec.wf : spec.built;
    const values = await page.evaluate(collectInPage, { sel, mainSel, props: spec.props });
    if (!values.missing && spec.props.includes("shownOnHover")) {
      values.shownOnHover = await hoverShows(page, sel, side);
    }
    result[spec.id] = values;
  }
  return result;
}

async function hoverShows(page, sel, side) {
  const target = side === "wf" ? page.locator(sel).first().locator("xpath=..") : page.locator(sel).first().locator("xpath=ancestor::*[@data-vp-hover][1]");
  try {
    await target.hover({ timeout: 2000 });
    await page.waitForTimeout(320);
    const opacity = await page.evaluate((s) => {
      let o = 1;
      for (let n = document.querySelector(s); n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
      return o;
    }, sel);
    await page.mouse.move(0, 0);
    return opacity > 0.95;
  } catch {
    return false;
  }
}
