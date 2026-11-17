// Private source-app check: reuse is a draft, never an automatic replay.
import assert from "node:assert/strict";
import fs from "node:fs";

import { launchVanta, waitForShell } from "../vanta-app.mjs";
import { startScriptedModel } from "../done-path/scripted-model.mjs";
import { seedSessions } from "./seed.mjs";

globalThis.__vantaKeepRoot = true;
const checks = [];
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
const model = await startScriptedModel();
const ctx = await launchVanta({ hidden: true, seed: seedSessions, extraEnv: { VANTA_OPENAI_BASE_URL: model.url } });
const { page } = ctx;
const title = "Competitor pricing review";
const api = () => page.evaluate(() => window.desktopBridge.api({ path: "/api/runs" }));

async function openPastWork() {
  await page.getByTestId("nav-artifacts").click();
  await page.getByRole("button", { name: "Past work", exact: true }).click();
  await page.getByRole("button", { name: `Use in new chat: ${title}`, exact: true }).waitFor();
}

async function library() {
  await openPastWork();
  const search = page.getByPlaceholder("Search past work…", { exact: true });
  await search.fill("competitor pricing");
  check("Search isolates the previous request", await page.locator('[data-slot="run-row"]').count() === 1);
  check("Reuse is explained as review-before-send", await page.getByText(/Nothing runs until you send it/).isVisible());
  await page.getByRole("button", { name: `Save: ${title}`, exact: true }).click();
  await page.getByRole("button", { name: `Saved: ${title}`, exact: true }).waitFor();
  await page.reload();
  await waitForShell(page);
  await openPastWork();
  await page.getByPlaceholder("Search past work…", { exact: true }).fill("competitor pricing");
  check("Saved work survives reload through the real server", await page.getByRole("button", { name: `Saved: ${title}`, exact: true }).isVisible());
  await ctx.shot(`${ctx.root}/01-past-work.png`);
  await ctx.resize(800, 900);
  const row = page.locator('[data-slot="run-row"]').first();
  check("List and actions fit an 800px window", await row.evaluate(el => el.scrollWidth <= el.clientWidth));
  const reuse = page.getByRole("button", { name: `Use in new chat: ${title}`, exact: true });
  await reuse.focus();
  check("Reuse is keyboard reachable", await reuse.evaluate(el => el === document.activeElement));
  await ctx.shot(`${ctx.root}/02-narrow-past-work.png`);
  return reuse;
}

async function reuseDraft(reuse) {
  const before = await api();
  const requests = model.requests.length;
  await reuse.press("Enter");
  const input = page.locator('[data-vp="composer-input"]').filter({ visible: true }).first();
  await input.waitFor();
  await page.waitForFunction(text => [...document.querySelectorAll('[data-vp="composer-input"]')].some(el => el.textContent === text), title);
  check("Original request appears as an unsent new-chat draft", await input.innerText() === title);
  await input.press("End");
  await page.keyboard.type(" — updated");
  check("The reused request remains editable", (await input.innerText()).endsWith(" — updated"));
  await page.waitForTimeout(1500);
  check("Reuse and editing make no model request", model.requests.length === requests && requests === 0);
  check("Reuse does not produce another completed run", JSON.stringify(await api()) === JSON.stringify(before));
  await ctx.shot(`${ctx.root}/03-reused-draft.png`);
}

try {
  await waitForShell(page);
  await reuseDraft(await library());
  const report = { root: ctx.root, checks, modelRequests: model.requests.length, rendererErrors: ctx.errors };
  fs.writeFileSync(`${ctx.root}/dn22-past-work.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  await ctx.shot(`${ctx.root}/failure.png`).catch(() => undefined);
  process.stderr.write(`${JSON.stringify({ root: ctx.root, checks, error: String(error) })}\n`);
  throw error;
} finally {
  await ctx.close();
  await model.close();
}
