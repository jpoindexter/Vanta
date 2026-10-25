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
  }
}

async function journey(name, action) {
  const request = `flaky ${name} request`;
  await newChat(current.page);
  await sendText(current.page, request);
  await failureCard(name, `${name}-before-restart.png`);
  const restored = await coldOpen(request, name);
  steps.push({ name, criterion: "same reason, partial output and offered actions survive restart without execution", ...restored });
  await recover(action, request);
  await waitText(`Recovered: ${name}`);
  const turns = model.requests.filter((r) => r.flaky === name && r.turnStart).map((r) => r.attempt);
  assert.deepEqual(turns, [1, 2], "recovery did not start exactly one additional turn");
  await current.page.screenshot({ path: path.join(output, `${name}-recovered.png`) });
  steps.push({ name, criterion: "explicit recovery starts exactly one additional turn", action, turns });
}

let failure;
try {
  await open();
  await journey("coldretry", "Retry the step");
  await journey("coldcheckpoint", "Start from checkpoint");
  await journey("coldedit", "Edit request");
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
