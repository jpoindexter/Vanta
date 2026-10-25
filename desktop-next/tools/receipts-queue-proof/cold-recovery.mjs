// Actual failed turn -> full app restart -> ordinary history open -> deliberate recovery.
// Reuses the real-shell sandbox and loopback model; never touches owner profiles.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { killLeftovers, launchApp, makeSandbox } from "../done-path/harness.mjs";
import { newChat, sendText, waitForShell } from "../done-path/lib.mjs";
import { startScriptedModel } from "./scripted-model.mjs";

const output = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), "vanta-cold-recovery-proof-"));
const only = process.argv[3];
if (only && !['coldretry', 'coldcheckpoint', 'coldedit', 'coldnudge', 'coldnudgeedit', 'coldfile'].includes(only)) throw new Error('Unknown recovery proof case');
fs.mkdirSync(output, { recursive: true });
const composer = "[data-vp='composer-input']";
const headline = "Vanta stopped: the same step kept failing";
const actions = ["Retry the step", "Start from checkpoint", "Edit request"];
const box = await makeSandbox();
const model = await startScriptedModel();
const windows = [], steps = [];
let current;

async function open() {
  current = await launchApp({ box, project: box.projectA, modelUrl: model.url });
  windows.push(current.errors);
  current.page.setDefaultTimeout(25_000);
  await waitForShell(current.page);
}

async function waitText(text) {
  await current.page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 30_000 });
}

async function failureCard(name, shot) {
  await waitText(headline);
  await waitText(`I started on ${name} and made some progress.`);
  const buttons = current.page.locator("[data-vp='failure-actions'] button");
  await buttons.first().waitFor({ state: "visible" });
  const labels = (await buttons.allInnerTexts()).map((value) => value.trim());
  assert.deepEqual([...labels].sort(), [...actions].sort());
  await current.page.screenshot({ path: path.join(output, shot) });
  return labels;
}

async function coldOpen(request, name) {
  const count = model.requests.length;
  await current.app.close();
  killLeftovers(box);
  await open();
  await current.page.locator("[data-tour='sessions-sidebar']").getByText(request, { exact: false }).first().click();
  const labels = await failureCard(name, `${name}-after-restart.png`);
  // A bounded negative observation: merely reopening history must not call the model.
  await current.page.waitForTimeout(600);
  assert.equal(model.requests.length, count, "history open retried the failed request");
  return { labels, requestsBeforeRestart: count, requestsAfterOpen: model.requests.length };
}

async function recover(action, request) {
  const page = current.page;
  await page.getByRole("button", { name: action, exact: true }).click();
  if (action === "Start from checkpoint") {
    const held = await page.locator(composer).first().innerText();
    assert.ok(held.includes(`Original request: ${request}`));
    assert.ok(held.includes("made some progress."));
    await page.keyboard.press("Enter");
  } else if (action === "Edit request") {
    const editor = page.locator("[data-slot='aui_edit-composer-root'] [contenteditable='true'], [data-slot='aui_edit-composer-root'] textarea").first();
    await editor.waitFor({ state: "visible" });
    assert.ok((await editor.evaluate((el) => "value" in el ? el.value : el.innerText)).includes(request));
    await editor.click(); await page.keyboard.press("Meta+a");
    await page.keyboard.insertText(`${request}, with more detail`); await page.keyboard.press("Enter");
    if (request.includes('coldnudgeedit')) {
      const confirmation = page.getByRole('dialog').filter({ hasText: 'Restore to this checkpoint?' });
      await confirmation.getByRole('button', { name: 'Restore & rerun', exact: true }).waitFor({ state: 'visible' });
      await page.screenshot({ path: path.join(output, 'edit-restore-confirmation.png') });
      await confirmation.getByRole('button', { name: 'Restore & rerun', exact: true }).click();
    }
  }
}

async function journey(name, action) {
  const request = `${name === 'coldfile' ? '@file:brief.md\n\n' : ''}flaky ${name} request`;
  await newChat(current.page);
  await sendText(current.page, request);
  await failureCard(name, `${name}-before-restart.png`);
  const restored = await coldOpen(request, name);
  if (name.startsWith('coldnudge')) {
    const sessions = path.join(box.vantaHome, 'sessions');
    const receipts = fs.readdirSync(sessions).filter(file => file.endsWith('.json')).flatMap(file =>
      JSON.parse(fs.readFileSync(path.join(sessions, file), 'utf8')).messages.map(message => message.desktopRun));
    const saved = receipts.find(receipt => receipt?.checkpoint?.instruction === request);
    assert.ok(saved?.checkpoint?.partialText?.includes('Before the internal continuation.'), 'checkpoint lost work before a synthetic user nudge');
  }
  steps.push({ name, criterion: "same reason, partial output and offered actions survive restart without execution", ...restored });
  await recover(action, request);
  await waitText(`Recovered: ${name}`);
  const turns = model.requests.filter((r) => r.flaky === name && r.turnStart).map((r) => r.attempt);
  assert.deepEqual(turns, [1, 2], "recovery did not start exactly one additional turn");
  if (name === 'coldfile') assert.equal(model.requests.findLast(r => r.flaky === name && r.turnStart)?.lastUser, request, 'recovery dropped the attachment reference');
  await current.page.screenshot({ path: path.join(output, `${name}-recovered.png`) });
  steps.push({ name, criterion: "explicit recovery starts exactly one additional turn", action, turns });
}

let failure;
try {
  await open();
  for (const [name, action] of [['coldretry', 'Retry the step'], ['coldcheckpoint', 'Start from checkpoint'],
    ['coldedit', 'Edit request'], ['coldnudge', 'Retry the step'], ['coldnudgeedit', 'Edit request'], ['coldfile', 'Retry the step']]) {
    if (!only || only === name) await journey(name, action);
  }
  await sendText(current.page, "echo later unrelated request");
  await waitText("echo: later unrelated request");
  assert.equal(await current.page.locator("[data-vp='failure-actions'] button").count(), 0);
  steps.push({ criterion: "older failure cannot offer recovery for a later request" });
  assert.deepEqual(windows.flat(), [], "renderer errors observed");
} catch (error) {
  failure = String(error.stack ?? error);
  await current?.page.screenshot({ path: path.join(output, "FAIL.png") }).catch(() => {});
} finally {
  await current?.app.close().catch(() => {});
  model.release(); await model.close(); killLeftovers(box);
  const result = { pass: !failure, output, sandbox: box.root, packagedApp: process.env.VANTA_PACKAGED_APP ?? null,
    steps, failure, rendererErrors: windows.flat(), modelRequests: model.requests };
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify({ output, pass: result.pass, steps: steps.length, failure, rendererErrors: result.rendererErrors.length, requests: model.requests.length }) + "\n");
  if (failure) process.exitCode = 1;
}
