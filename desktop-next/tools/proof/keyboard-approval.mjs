// Real source-Electron keys against the existing private-profile/scripted-model harness.
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeSandbox, launchApp, killLeftovers } from "../done-path/harness.mjs";
import { startScriptedModel } from "../done-path/scripted-model.mjs";
import { newChat, sendText, waitOutcome, waitFinished, waitForShell } from "../done-path/lib.mjs";

const box = await makeSandbox();
const model = await startScriptedModel();
const ctx = await launchApp({ box, project: box.projectA, modelUrl: model.url });
const checks = [];
const walks = [];
const errors = [];
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
const read = () => fs.readFileSync(`${box.projectA}/brief.md`, "utf8");
const original = read();
const prompt = 'keyboard [[call edit_file {"path":"brief.md","old_string":"# Local brief","new_string":"# Approved edit"}]]';
ctx.page.on("pageerror", error => errors.push(String(error)));
ctx.page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

async function focused() {
  return ctx.page.evaluate(() => {
    const el = document.activeElement;
    const style = getComputedStyle(el);
    return {
      name: el.getAttribute("aria-label") || el.textContent?.slice(0, 100),
      tag: el.tagName,
      slot: el.getAttribute("data-slot"),
      card: Boolean(el.closest('[data-vp="approval-card"]')),
      composer: Boolean(el.closest('[data-slot="composer-root"]')),
      ring: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2,
    };
  });
}

async function approval(text = prompt) {
  await newChat(ctx.page);
  await sendText(ctx.page, text);
  check("Real edit waits for its exact approval", await waitOutcome(ctx.page) === "card");
  check("Approval arrival leaves typing focus in the composer", await ctx.page.locator('[data-vp="composer-input"]').first().evaluate(el => el === document.activeElement));
}

async function enterCard() {
  const walk = [];
  let origin;
  for (let i = 0; i < 80; i += 1) {
    const previous = await ctx.page.evaluateHandle(() => document.activeElement);
    await ctx.page.keyboard.press("Shift+Tab");
    const row = await focused();
    walk.push(row);
    if (row.composer) check(`Composer stop ${row.name} is named and has a keyboard ring`, Boolean(row.name) && row.ring);
    if (row.card) { origin = previous; break; }
    await previous.dispose();
  }
  walks.push(walk);
  check("Shift+Tab reaches Reject without programmatic focus", Boolean(origin) && (await focused()).name === "Reject");
  return origin;
}

async function restores(origin) {
  await ctx.page.waitForFunction(el => document.activeElement === el, origin, { timeout: 5000 }).catch(async error => {
    const state = await origin.evaluate(el => ({ connected: el.isConnected, origin: el.outerHTML, active: document.activeElement.outerHTML.slice(0, 600) }));
    fs.writeFileSync(`${box.root}/focus-failure.json`, JSON.stringify(state, null, 2));
    throw error;
  });
  check("Decision returns focus to the exact preceding surface", await origin.evaluate(el => el === document.activeElement));
  await origin.dispose();
}

try {
  await waitForShell(ctx.page);
  await approval();
  const origin = await enterCard();
  for (const [key, name] of [["Shift+Tab", "Always allow edit_file in this project"], ["Shift+Tab", "Allow once"], ["Tab", "Always allow edit_file in this project"], ["Tab", "Reject"]]) {
    await ctx.page.keyboard.press(key);
    const row = await focused();
    check(`${key} reaches ${name} with a visible keyboard ring`, row.name === name && row.ring);
  }
  check("Navigation alone does not approve or edit", model.requests.length === 1 && read() === original);
  await ctx.page.keyboard.press("Tab");
  check("Tab can leave the inline approval; it is not a modal trap", !(await focused()).card);
  await ctx.page.keyboard.press("Shift+Tab");
  check("Shift+Tab returns to Reject", (await focused()).name === "Reject");
  await ctx.page.screenshot({ path: `${box.root}/keyboard-approval.png` });
  await ctx.page.keyboard.press("Enter");
  check("Reject completes the waiting turn", await waitFinished(ctx.page));
  await restores(origin);
  check("Rejected edit has no filesystem effect", read() === original);
  await ctx.page.screenshot({ path: `${box.root}/focus-return.png` });

  await approval();
  const allowOrigin = await enterCard();
  await ctx.page.keyboard.press("Shift+Tab");
  await ctx.page.keyboard.press("Shift+Tab");
  check("Allow once has keyboard focus before activation", (await focused()).name === "Allow once");
  await ctx.page.keyboard.press("Space");
  check("Space activates Allow once and the turn finishes", await waitFinished(ctx.page));
  await restores(allowOrigin);
  check("Allowed edit is actually written", read().startsWith("# Approved edit"));
  const permissions = fs.existsSync(box.permissionsFile) ? fs.readFileSync(box.permissionsFile, "utf8") : "";
  check("Allow once creates no saved Always rule", !permissions.includes("edit_file"));
  check("The real turn performs exactly one approved edit", model.requests.filter(row => row.toolCall === "edit_file").length === 2);
  const approved = read();
  await approval('escape [[call edit_file {"path":"brief.md","old_string":"# Approved edit","new_string":"# Must not run"}]]');
  await ctx.page.keyboard.press("Escape");
  check("Escape rejects the waiting approval and settles the turn", await waitFinished(ctx.page));
  check("Escape does not apply the rejected edit", read() === approved);
  check("Escape keeps the composer focused", await ctx.page.locator('[data-vp="composer-input"]').first().evaluate(el => el === document.activeElement));
  check("No renderer errors during navigation and both decisions", errors.length === 0);
  const report = { root: box.root, checks, walks, rendererErrors: errors, modelRequests: model.requests.length };
  fs.writeFileSync(`${box.root}/keyboard-approval.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  await ctx.page.screenshot({ path: `${box.root}/failure.png` }).catch(() => undefined);
  process.stderr.write(`${box.root}\n${error.stack}\n`);
  process.exitCode = 1;
} finally {
  await ctx.app.close();
  await model.close();
  killLeftovers(box);
}
