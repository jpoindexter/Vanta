import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoPath = path.join(repoRoot, "docs/design-refs/vanta-local-studio-operator.html");
const screenshotDir = path.join(
  repoRoot,
  "docs/research/local-studio-vanta-extraction-2026-07-16/screenshots",
);

await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

async function assertVisible(selector, label) {
  if (!(await page.locator(selector).isVisible())) throw new Error(`${label} is not visible`);
}

async function assertText(selector, expected, label) {
  const text = (await page.locator(selector).textContent())?.trim() ?? "";
  if (!text.includes(expected)) throw new Error(`${label}: expected ${expected}, received ${text}`);
}

async function assertNoViewportOverflow(label) {
  const geometry = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    bodyWidth: document.body.scrollWidth,
    bodyHeight: document.body.scrollHeight,
    appWidth: document.querySelector(".app")?.getBoundingClientRect().width ?? 0,
    appHeight: document.querySelector(".app")?.getBoundingClientRect().height ?? 0,
  }));
  if (geometry.bodyWidth > geometry.viewportWidth + 1 || geometry.bodyHeight > geometry.viewportHeight + 1) {
    throw new Error(`${label} overflow: ${JSON.stringify(geometry)}`);
  }
}

await page.setViewportSize({ width: 1440, height: 960 });
await page.goto(pathToFileURL(demoPath).href);
await page.waitForLoadState("domcontentloaded");
await assertVisible(".composer", "desktop composer");
await assertVisible(".runtime-strip", "desktop runtime strip");
await assertVisible(".inspector", "desktop inspector");
await assertNoViewportOverflow("desktop");

await page.getByRole("button", { name: /GPU Rig/ }).click();
await assertText("#runtimeTitle", "GPU Rig", "controller switch");
await assertText("#stripEngine", "vLLM", "engine switch");

await page.getByRole("button", { name: "Open queued turns" }).click();
await assertVisible("#queueDrawer", "queued turn drawer");
await page.getByRole("button", { name: "Close queue" }).click();

await page.getByRole("button", { name: "Profiles" }).first().click();
await assertVisible("#profilesModal", "runtime profiles modal");
await page.locator('[data-close="profiles"]').first().click();

await page.getByRole("button", { name: "Set up a runtime" }).click();
await assertVisible("#setupModal", "setup modal");
await page.getByRole("button", { name: "Use this profile" }).click();
await assertText(".setup-step.active", "Profile", "setup progression");
await page.locator('[data-close="setup"]').first().click();

const initialTheme = await page.locator("html").getAttribute("data-theme");
await page.getByRole("button", { name: "Toggle light and dark theme" }).click();
const nextTheme = await page.locator("html").getAttribute("data-theme");
if (initialTheme === nextTheme) throw new Error("theme toggle did not change state");
await page.getByRole("button", { name: "Toggle light and dark theme" }).click();

await page.screenshot({ path: path.join(screenshotDir, "desktop-1440.png"), fullPage: true });

for (const viewport of [
  { width: 1024, height: 700, name: "compact-1024" },
  { width: 760, height: 700, name: "compact-760" },
  { width: 390, height: 844, name: "phone-390" },
]) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.locator(".app").evaluate((element) => {
    element.classList.remove("inspector-open-mobile", "sidebar-open-mobile");
  });
  await assertVisible(".composer", `${viewport.name} composer`);
  await assertVisible(".runtime-strip", `${viewport.name} runtime strip`);
  await assertVisible("#prompt-1", `${viewport.name} transcript`);
  await assertNoViewportOverflow(viewport.name);
  if (viewport.width <= 920) {
    await page.getByRole("button", { name: "Toggle inspector mobile" }).click();
    await assertVisible(".inspector", `${viewport.name} inspector drawer`);
    await page.getByRole("button", { name: "Toggle inspector mobile" }).click();
  }
  if (viewport.width <= 680) {
    await page.getByRole("button", { name: "Toggle projects mobile" }).click();
    await assertVisible(".sidebar", `${viewport.name} project drawer`);
    await page.getByRole("button", { name: "Toggle projects mobile" }).click();
  }
  await page.screenshot({ path: path.join(screenshotDir, `${viewport.name}.png`), fullPage: true });
}

if (pageErrors.length > 0) throw new Error(`page errors: ${pageErrors.join(" | ")}`);

await browser.close();
console.log("Vanta Local Studio operator demo smoke passed: desktop, compact, and phone flows verified.");
