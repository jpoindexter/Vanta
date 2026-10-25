import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const root = process.env.VANTA_PROOF_SOURCE;
assert.ok(root, "An isolated source snapshot is required");
const from = (file) => import(pathToFileURL(path.join(root, "desktop-next/tools", file)));
const { makeSandbox, launchApp, killLeftovers } = await from("done-path/harness.mjs");
const { newChat, sendText, waitForShell, composerText } = await from("done-path/lib.mjs");
const output = path.resolve(process.argv[2]); fs.mkdirSync(output, { recursive: true });
const box = await makeSandbox(), checks = [], requests = [], errors = [];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let current, failure, before, fixtureHash;
const sse = (delta, finish = null) => `data: ${JSON.stringify({ id: "image-queue", object: "chat.completion.chunk", model: "done-path", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
const server = http.createServer(async (req, res) => {
  if (req.url.endsWith("/models")) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ data: [{ id: "done-path" }] })); return; }
  let raw = ""; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw), content = body.messages.findLast((m) => m.role === "user")?.content;
  const parts = Array.isArray(content) ? content : [{ text: content }];
  const text = parts.filter((p) => typeof p.text === "string").map((p) => p.text).join("\n");
  const imageHashes = parts.flatMap((p) => {
    const data = /^data:image\/[^;,]+;base64,(.+)$/.exec(p.image_url?.url ?? "");
    return data ? [hash(Buffer.from(data[1], "base64"))] : [];
  });
  requests.push({ text, imageHashes });
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  if (text.startsWith("hold ")) { res.write(sse({ role: "assistant", content: "Holding the line." })); return; }
  res.end(sse({ role: "assistant", content: "Queue image accepted." }) + sse({}, "stop") + "data: [DONE]\n\n");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const modelUrl = `http://127.0.0.1:${server.address().port}/v1`;
async function open() {
  current = await launchApp({ box, project: box.projectA, modelUrl }); errors.push(current.errors);
  current.page.setDefaultTimeout(15_000); await waitForShell(current.page);
  const later = current.page.getByRole("button", { name: /choose a provider later/i });
  if (await later.isVisible().catch(() => false)) await later.click();
}
function nativeQueue() {
  const base = path.join(box.userData, "unsent-attachments-v2");
  return fs.existsSync(base) ? fs.readdirSync(base).flatMap((folder) => fs.readdirSync(path.join(base, folder))
    .filter((file) => file.endsWith(".queue.json")).map((file) => JSON.parse(fs.readFileSync(path.join(base, folder, file), "utf8")))) : [];
}
const payload = "Inspect this queued image after restart.";
try {
  await open(); await newChat(current.page); await sendText(current.page, "hold custody queue anchor");
  await current.page.getByText("Holding the line.", { exact: false }).first().waitFor();
  assert.equal(requests.length, 1); checks.push("real initial turn remains busy against loopback model");
  const editor = current.page.locator("[data-vp='composer-input']").first();
  await editor.click(); await current.page.keyboard.insertText(payload);
  const bytes = await editor.evaluate(async (el) => {
    const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64;
    canvas.getContext("2d").fillRect(8, 8, 32, 32);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const data = new DataTransfer(); data.items.add(new File([blob], "queued.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  fixtureHash = hash(Buffer.from(bytes));
  await current.page.getByRole("button", { name: "Preview queued.png", exact: true }).waitFor();
  await current.page.getByTestId("draft-custody-status").waitFor({ state: "hidden" });
  await editor.click(); await current.page.keyboard.press("Enter");
  await current.page.locator("[data-vp='queue-row']").filter({ hasText: payload }).waitFor();
  before = nativeQueue(); assert.equal(before.length, 1); assert.equal(before[0].status, "queued");
  assert.equal(hash(Buffer.from(before[0].entry.attachments[0].imageData.dataBase64, "base64")), fixtureHash);
  checks.push("queue acknowledgment holds one original ID and actual image bytes in native custody");
  assert.equal((await composerText(current.page)).trim(), "");
  await current.page.screenshot({ path: path.join(output, "before-crash.png") });
  const exited = new Promise((resolve) => current.app.process().once("exit", resolve));
  current.app.process().kill("SIGKILL"); await exited;
  killLeftovers(box); await open();
  await current.page.locator("[data-tour='sessions-sidebar']").getByText("hold custody queue anchor", { exact: false }).first().click();
  const row = current.page.locator("[data-vp='queue-row']").filter({ hasText: payload }); await row.waitFor();
  assert.equal(await row.count(), 1); assert.equal(nativeQueue()[0].entry.id, before[0].entry.id);
  assert.equal((await composerText(current.page)).trim(), "");
  await current.page.waitForTimeout(700); assert.equal(requests.length, 1);
  checks.push("cold restart restores exactly one same-ID queued message without resurrecting or sending the source draft");
  await current.page.screenshot({ path: path.join(output, "after-restart.png") });
  const scratch = "Keep my separate unsent draft.";
  const liveEditor = current.page.locator("[data-vp='composer-input']").first();
  await liveEditor.click(); await current.page.keyboard.insertText(scratch);
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  assert.equal(await composerText(current.page), payload);
  await current.page.keyboard.press("Escape");
  assert.equal(await composerText(current.page), scratch);
  assert.equal(nativeQueue()[0].entry.id, before[0].entry.id);
  assert.equal(nativeQueue()[0].entry.text, payload);
  assert.equal(hash(Buffer.from(nativeQueue()[0].entry.attachments[0].imageData.dataBase64, "base64")), fixtureHash);
  checks.push("queued Edit and Cancel restore the separate draft without changing saved text or PNG");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await liveEditor.click(); await current.page.keyboard.press("Meta+A");
  const revised = payload + " Revised exactly once.";
  await current.page.keyboard.insertText(revised);
  await current.page.getByRole("button", { name: "Save", exact: true }).click();
  await current.page.waitForFunction(expected => document.querySelector("[data-vp='composer-input']")?.innerText === expected, scratch);
  assert.equal(nativeQueue()[0].entry.id, before[0].entry.id);
  assert.equal(nativeQueue()[0].entry.text, revised);
  assert.equal(hash(Buffer.from(nativeQueue()[0].entry.attachments[0].imageData.dataBase64, "base64")), fixtureHash);
  assert.equal(requests.length, 1);
  checks.push("queued Save keeps the same native ID and PNG and restores the separate draft without a send");
  await current.page.screenshot({ path: path.join(output, "after-queue-edit.png") });
  await row.getByRole("button", { name: "Send now", exact: true }).click();
  await current.page.getByText("Queue image accepted.", { exact: false }).first().waitFor();
  assert.equal(requests.length, 2); assert.equal(requests[1].text, revised);
  assert.deepEqual(requests[1].imageHashes, [fixtureHash]);
  await row.waitFor({ state: "hidden" });
  const accepted = nativeQueue()[0]; assert.equal(accepted.status, "accepted");
  assert.equal(accepted.entry.text, ""); assert.deepEqual(accepted.entry.attachments, []);
  assert.ok(accepted.accepted.runtimeSessionId);
  checks.push("deliberate Send now delivers exact text and PNG once and retains only its acknowledgment");
  assert.deepEqual(errors.flat(), []);
} catch (error) {
  failure = String(error.stack ?? error);
  await current?.page.screenshot({ path: path.join(output, "FAIL.png") }).catch(() => {});
  if (current) fs.writeFileSync(path.join(output, "FAIL-body.txt"), await current.page.locator("body").innerText().catch(() => "Page unavailable"));
} finally {
  await current?.app.close().catch(() => {}); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); killLeftovers(box);
  const result = { pass: !failure, checks, failure, requests, fixtureHash, queueId: before?.[0]?.entry.id, sandbox: box.root, rendererErrors: errors.flat() };
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, pass: result.pass, checks: checks.length, failure, errors: result.rendererErrors.length }));
  if (failure) process.exitCode = 1;
}
