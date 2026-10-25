// Real app, private profile, synthetic paste event carrying actual PNG bytes.
// Never reads or changes the owner's clipboard, profiles, credentials or app.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const root = process.env.VANTA_PROOF_SOURCE;
assert.ok(root, "An isolated source snapshot is required");
const from = (file) => import(pathToFileURL(path.join(root, "desktop-next/tools", file)));
const { makeSandbox, launchApp, killLeftovers } = await from("done-path/harness.mjs");
const { newChat, sendText, waitForShell, waitFinished, composerText } = await from("done-path/lib.mjs");
const { startScriptedModel } = await from("done-path/scripted-model.mjs");
const output = path.resolve(process.argv[2]);
fs.mkdirSync(output, { recursive: true });
const box = await makeSandbox(), model = await startScriptedModel();
const errors = [], checks = [];
const draft = "Keep this exact unsent image draft after restart.";
let current, expectedHash, failure;

async function open() {
  current = await launchApp({ box, project: box.projectA, modelUrl: model.url });
  errors.push(current.errors);
  current.page.setDefaultTimeout(20_000);
  await waitForShell(current.page);
  const later = current.page.getByRole("button", { name: /choose a provider later/i });
  if (await later.isVisible().catch(() => false)) await later.click();
  await current.page.getByText("ready", { exact: true }).first().waitFor({ state: "visible" });
}

async function previewHash() {
  const page = current.page;
  await page.getByRole("button", { name: "Preview screenshot.png", exact: true }).click();
  const image = page.getByRole("dialog").locator("img").first();
  await image.waitFor({ state: "visible" });
  const base64 = await image.evaluate(async (el) => {
    const bytes = new Uint8Array(await (await fetch(el.src)).arrayBuffer());
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  });
  const hash = createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");
  await page.keyboard.press("Escape");
  return hash;
}

try {
  await open();
  await newChat(current.page);
  await current.page.locator("[data-vp='composer-input']").first().click();
  await current.page.keyboard.insertText("custody continuity anchor");
  await current.page.waitForTimeout(300);
  assert.equal(await composerText(current.page), "custody continuity anchor");
  await current.page.screenshot({ path: path.join(output, "before-anchor-send.png") });
  fs.writeFileSync(path.join(output, "before-anchor-body.txt"), await current.page.locator("body").innerText());
  await current.page.keyboard.press("Enter");
  assert.equal(await waitFinished(current.page), true);
  checks.push("ordinary chat completed against loopback model");
  const composer = current.page.locator("[data-vp='composer-input']").first();
  await composer.click();
  await current.page.keyboard.insertText(draft);
  const png = await composer.evaluate(async (el) => {
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext("2d");
    context.fillStyle = "#6d28d9"; context.fillRect(0, 0, 64, 64);
    context.fillStyle = "#ffffff"; context.fillRect(12, 12, 20, 20);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const data = new DataTransfer();
    data.items.add(new File([blob], "screenshot.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  });
  expectedHash = createHash("sha256").update(Buffer.from(png, "base64")).digest("hex");
  assert.equal(await previewHash(), expectedHash);
  checks.push("actual pasted PNG preview bytes match fixture before restart");
  await current.page.screenshot({ path: path.join(output, "before-restart.png") });
  await current.page.waitForTimeout(800);
  const requests = model.requests.length;
  const goodStore = await current.page.evaluate(() => localStorage.getItem("desktop:composer-drafts:v4"));
  assert.ok(goodStore, "Fixture draft must already be persisted");
  await current.page.evaluate(() => {
    localStorage.setItem("desktop:composer-drafts:v4", "{broken");
    window.dispatchEvent(new StorageEvent("storage", { key: "desktop:composer-drafts:v4" }));
  });
  const warning = current.page.getByTestId("draft-text-storage-status");
  await warning.waitFor({ state: "visible" });
  assert.equal(await composerText(current.page), draft);
  assert.equal(await previewHash(), expectedHash);
  assert.equal(model.requests.length, requests);
  checks.push("corrupt shared snapshot leaves exact visible text and PNG intact and announces failure without a send");
  await warning.getByRole("button", { name: "Retry", exact: true }).click();
  await warning.waitFor({ state: "visible" });
  assert.equal(await current.page.evaluate(() => localStorage.getItem("desktop:composer-drafts:v4")), "{broken");
  assert.equal(await composerText(current.page), draft);
  checks.push("Retry retains corrupt bytes and current draft instead of treating unreadable data as empty");
  await current.page.screenshot({ path: path.join(output, "corrupt-store-warning.png") });
  await current.page.evaluate(good => localStorage.setItem("desktop:composer-drafts:v4", good), goodStore);
  await warning.getByRole("button", { name: "Retry", exact: true }).click();
  await warning.waitFor({ state: "hidden" });
  assert.equal(await composerText(current.page), draft);
  assert.equal(await previewHash(), expectedHash);
  checks.push("valid snapshot recovery clears the warning without changing draft text or image bytes");
  await current.app.close(); killLeftovers(box);
  await open();
  await current.page.locator("[data-tour='sessions-sidebar']").getByText("custody continuity anchor", { exact: false }).first().click();
  await current.page.locator("[data-vp='composer-input']").first().waitFor({ state: "visible" });
  await current.page.waitForTimeout(800);
  assert.equal(await composerText(current.page), draft);
  checks.push("exact unsent draft text survives full app restart");
  assert.equal(model.requests.length, requests);
  checks.push("reopening history does not invoke the model");
  await current.page.screenshot({ path: path.join(output, "after-restart.png") });
  assert.equal(await previewHash(), expectedHash);
  checks.push("restored preview has exact original PNG bytes");
  const restored = current.page.locator("[data-vp='composer-input']").first();
  await restored.click(); await current.page.keyboard.press("Enter");
  assert.equal(await waitFinished(current.page, { finishedBefore: 1 }), true);
  const sent = model.requests.slice(requests);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].hasImage, true);
  assert.deepEqual(sent[0].imageHashes, [expectedHash]);
  assert.equal(sent[0].prompt, draft);
  checks.push("deliberate send submits restored text and image exactly once");
  assert.equal(await current.page.getByRole("button", { name: "Preview screenshot.png", exact: true }).count(), 0);
  assert.deepEqual(errors.flat(), []);
} catch (error) {
  failure = String(error.stack ?? error);
  await current?.page.screenshot({ path: path.join(output, "FAIL.png") }).catch(() => {});
  if (current) fs.writeFileSync(path.join(output, "FAIL-body.txt"), await current.page.locator("body").innerText().catch(() => "Page unavailable"));
} finally {
  await current?.app.close().catch(() => {});
  await model.close(); killLeftovers(box);
  const result = { pass: !failure, checks, failure, expectedHash, sandbox: box.root,
    app: process.env.VANTA_PACKAGED_APP ?? "source", source: root,
    rendererErrors: errors.flat(), requests: model.requests };
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, pass: result.pass, checks: checks.length, failure, errors: result.rendererErrors.length }));
  if (failure) process.exitCode = 1;
}
