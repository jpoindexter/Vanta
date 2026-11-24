import assert from "node:assert/strict";
import fs from "node:fs";
import { makeSandbox, launchApp, killLeftovers } from "../done-path/harness.mjs";
import { startScriptedModel } from "../done-path/scripted-model.mjs";
import { waitForShell, newChat, sendText, waitFinished } from "../done-path/lib.mjs";

const box = await makeSandbox();
const model = await startScriptedModel();
const ctx = await launchApp({ box, project: box.projectA, modelUrl: model.url });
const checks = [];
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
const labels = [1, 2, 3, 4].map(i => `Timeline ${i}:`);
const prefixes = rows => rows.map(text => text.slice(0, 11));

try {
  await waitForShell(ctx.page);
  await newChat(ctx.page);
  // Deliberately send on visible reply text, before the turn's settle edge.
  for (let i = 0; i < 4; i += 1) {
    await sendText(ctx.page, `${labels[i]} ${("Local navigation paragraph with several lines.\n").repeat(15)}`);
    check(`Visible local reply ${i + 1}`, await waitFinished(ctx.page, { finishedBefore: i }));
  }
  await ctx.page.waitForFunction(() => document.querySelectorAll('[data-role="user"][data-message-id]').length === 4);
  await ctx.page.waitForFunction(() => {
    const replies = document.querySelectorAll('[data-role="assistant"]');
    return replies.length === 4 && replies[3].textContent.includes("Scripted turn finished.") && !document.querySelector('[data-message-streaming="true"]');
  });
  const users = await ctx.page.locator('[data-role="user"][data-message-id]').allTextContents();
  const rail = await ctx.page.locator('.thread-timeline-tick').evaluateAll(rows => rows.map(el => el.getAttribute("aria-label")));
  assert.deepEqual(prefixes(users), labels);
  check("Transcript preserves submission order", true);
  assert.deepEqual(prefixes(rail), labels);
  check("Navigation previews match transcript order", true);
  assert.deepEqual(prefixes(model.requests.map(request => request.prompt)), labels);
  check("Model receives each prompt once in submission order", true);
  const file = fs.readdirSync(`${box.vantaHome}/sessions`).find(name => name.endsWith(".json"));
  const session = JSON.parse(fs.readFileSync(`${box.vantaHome}/sessions/${file}`, "utf8"));
  assert.deepEqual(prefixes(session.messages.filter(row => row.role === "user").map(row => row.content)), labels);
  check("Durable session preserves the same order", true);
  check("No renderer errors", ctx.errors.length === 0);
  await ctx.page.screenshot({ path: `${box.root}/prompt-order.png` });
  const report = { root: box.root, checks, users: prefixes(users), rail: prefixes(rail), requests: prefixes(model.requests.map(row => row.prompt)), rendererErrors: ctx.errors };
  fs.writeFileSync(`${box.root}/prompt-order.json`, JSON.stringify(report, null, 2));
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
