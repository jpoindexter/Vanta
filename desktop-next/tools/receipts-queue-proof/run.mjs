// Receipts-and-queue proof, one run: the real Electron shell + the real Vanta server and kernel in a sandbox
// (own VANTA_HOME, HOME, userData and ports), against a scripted local model. Drives the criterion through the UI:
//   V-008  a run is forced to fail: the specific reason, the partial output and the saved recovery actions are
//          on screen; each of Retry the step / Start from checkpoint / Edit request is used and the run recovers.
//   V-006  three messages are queued behind a busy run; one is edited, one moved, one cancelled; the app is quit
//          and relaunched; the remaining queue is intact; the queued turns run in the edited order.
//
//   node tools/receipts-queue-proof/run.mjs --out docs/proofs/receipts-queue/run-01 [--no-shots] [--keep] [--control wipe-queue]
import fs from "node:fs";
import path from "node:path";

import { killLeftovers, launchApp, makeSandbox } from "../done-path/harness.mjs";
import { newChat, sleep, waitForShell } from "../done-path/lib.mjs";
import { startScriptedModel } from "./scripted-model.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = path.resolve(option("--out", path.join(import.meta.dirname, "..", "..", "docs", "proofs", "receipts-queue", `run-${Date.now()}`)));
const TIMEOUT = 25_000;
const COMPOSER = "[data-vp='composer-input']";
const QUEUE_ROWS = "[data-vp='queue-row']";
const ALL_ACTIONS = ["Retry the step", "Edit request", "Start from checkpoint"];

const ctx = { box: null, model: null, cur: null, steps: [], saved: null };
const shot = async (name) => { if (!flag("--no-shots")) await ctx.cur?.page.screenshot({ path: path.join(outDir, `${name}.png`) }).catch(() => undefined); };
const page = () => ctx.cur.page;
const bodyText = () => page().evaluate(() => document.body.innerText);
const occurrences = async (text) => (await bodyText()).split(text).length - 1;

async function waitText(text, { timeout = TIMEOUT, present = true } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await bodyText()).includes(text) === present) return;
    await sleep(200);
  }
  throw new Error(`timed out waiting for text ${present ? "" : "to go: "}${JSON.stringify(text)}`);
}

async function type(text) {
  const composer = page().locator(COMPOSER).first();
  await composer.click();
  await page().keyboard.insertText(text);
}

const send = async (text) => { await type(text); await page().keyboard.press("Enter"); };
const queue = async (text) => { await type(text); await page().keyboard.press("Meta+Enter"); };

const rowTexts = () => page().locator(QUEUE_ROWS).evaluateAll((rows) => rows.map((row) => row.querySelector(".vp-queue-text")?.textContent?.replace(/\s+/g, " ").trim() ?? ""));
const rowButton = (index, name) => page().locator(QUEUE_ROWS).nth(index).getByRole("button", { name, exact: true });
const queueFile = () => {
  const dir = path.join(ctx.box.vantaHome, "desktop-turn-queues");
  const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((name) => name.endsWith(".json")) : undefined;
  return file ? JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) : { items: [] };
};
const savedInstructions = () => queueFile().items.map((item) => item.instruction);

async function waitRows(expected, timeout = TIMEOUT) {
  const deadline = Date.now() + timeout;
  let seen = [];
  while (Date.now() < deadline) {
    seen = await rowTexts().catch(() => []);
    if (expected.every((text, index) => seen[index]?.includes(text)) && seen.length === expected.length) return seen;
    await sleep(200);
  }
  throw new Error(`queue panel shows ${JSON.stringify(seen)}, expected rows containing ${JSON.stringify(expected)}`);
}

async function restartApp() {
  await ctx.cur.app.close().catch(() => undefined);
  await sleep(2500);
  killLeftovers(ctx.box);
  await sleep(500);
  await openApp();
}

async function openApp() {
  ctx.cur = await launchApp({ box: ctx.box, project: ctx.box.projectA, modelUrl: ctx.model.url });
  await waitForShell(page());
  await sleep(1500);
  page().setDefaultTimeout(TIMEOUT);
}

const HEADLINE = "Vanta stopped: the same step kept failing";

/** Wait for the failure card in the thread (a retried run replaces its card), then check what is on screen: reason, output so far, actions. */
async function expectFailureCard(name, spoken, nth) {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline && (await occurrences(HEADLINE)) < nth) await sleep(200);
  if ((await occurrences(HEADLINE)) < nth) throw new Error(`failure card ${nth} never appeared`);
  await page().locator("[data-vp='failure-actions'] button").first().waitFor({ state: "visible" });
  await waitText("It repeated the same step without making progress");
  await shot(`${name}-card`);
  const text = await bodyText();
  const buttons = await page().locator("[data-vp='failure-actions'] button").allInnerTexts();
  const failures = [];
  if (text.includes("Task stopped before completion")) failures.push("the generic stop sentence is shown");
  if (!text.includes(`I started on ${spoken} and made some progress.`)) failures.push("the output the run produced before it stopped is not on screen");
  for (const label of ALL_ACTIONS) if (!buttons.some((b) => b.trim() === label)) failures.push(`no "${label}" button (buttons: ${JSON.stringify(buttons)})`);
  if (failures.length) throw new Error(failures.join("; "));
  return { headline: "Vanta stopped: the same step kept failing", partialOutputVisible: true, buttons: buttons.map((b) => b.trim()) };
}

const STEPS = [
  ["a1", "forced failure shows the specific reason, the partial output and the saved actions; Retry the step recovers the run", async () => {
    await newChat(page());
    await send("flaky tidy the repo");
    const detail = await expectFailureCard("a1", "tidy", 1);
    await page().getByRole("button", { name: "Retry the step", exact: true }).click();
    await waitText("Recovered: tidy");
    await shot("a1-recovered");
    const turns = ctx.model.requests.filter((r) => r.flaky === "tidy" && r.turnStart).map((r) => r.attempt);
    if (turns.join() !== "1,2") throw new Error(`model saw turns ${turns.join()} for 'tidy', expected 1,2 (a second turn from the retry)`);
    return { ...detail, recoveredWith: "Retry the step", modelTurns: turns };
  }],
  ["a2", "Start from checkpoint puts the saved request in the message box; sending it recovers the run", async () => {
    await send("flaky second job");
    const detail = await expectFailureCard("a2", "second", 1);
    await page().getByRole("button", { name: "Start from checkpoint", exact: true }).click();
    await sleep(500);
    const composer = await page().locator(COMPOSER).first().innerText();
    if (!composer.includes("Original request: flaky second job")) throw new Error(`the message box holds ${JSON.stringify(composer.slice(0, 160))}`);
    await shot("a2-checkpoint-in-composer");
    await page().keyboard.press("Enter");
    await waitText("Recovered: second");
    await shot("a2-recovered");
    return { ...detail, composerHeld: composer.slice(0, 160).replace(/\s+/g, " "), recoveredWith: "Start from checkpoint" };
  }],
  ["a3", "Edit request opens the request for editing; sending it recovers the run", async () => {
    await send("flaky third step");
    const detail = await expectFailureCard("a3", "third", 1);
    await page().getByRole("button", { name: "Edit request", exact: true }).click();
    const editor = page().locator("[data-slot='aui_edit-composer-root'] [contenteditable='true'], [data-slot='aui_edit-composer-root'] textarea").first();
    await editor.waitFor({ state: "visible" });
    const held = await editor.evaluate((el) => ("value" in el ? el.value : el.innerText));
    if (!held.includes("flaky third step")) throw new Error(`the edit box holds ${JSON.stringify(held.slice(0, 120))}`);
    await shot("a3-editing");
    // Edit the words (an unchanged edit is not a new request), then send.
    await editor.click();
    await page().keyboard.press("Meta+a");
    await page().keyboard.insertText("flaky third step, with more detail");
    await page().keyboard.press("Enter");
    await waitText("Recovered: third");
    await shot("a3-recovered");
    return { ...detail, editBoxHeld: held.trim(), recoveredWith: "Edit request" };
  }],
  ["b1", "three messages queued behind a busy run appear in the panel and in the saved queue file", async () => {
    await newChat(page());
    await send("hold the line");
    await waitText("Holding the line.");
    for (const text of ["echo alpha", "echo bravo", "echo charlie"]) await queue(text);
    const rows = await waitRows(["echo alpha", "echo bravo", "echo charlie"]);
    await shot("b1-queued");
    const file = savedInstructions();
    if (file.join() !== "echo alpha,echo bravo,echo charlie") throw new Error(`queue file holds ${JSON.stringify(file)}`);
    return { panel: rows, file };
  }],
  ["b2", "edit one queued message", async () => {
    await rowButton(1, "Edit").click();
    const composer = page().locator(COMPOSER).first();
    await composer.click();
    await page().keyboard.press("Meta+a");
    await page().keyboard.insertText("echo bravo edited");
    await page().keyboard.press("Enter");
    const rows = await waitRows(["echo alpha", "echo bravo edited", "echo charlie"]);
    await shot("b2-edited");
    const file = savedInstructions();
    if (file.join() !== "echo alpha,echo bravo edited,echo charlie") throw new Error(`queue file holds ${JSON.stringify(file)}`);
    return { panel: rows, file };
  }],
  ["b3", "reorder: move the last message one place earlier", async () => {
    await rowButton(2, "Move earlier").click();
    const rows = await waitRows(["echo alpha", "echo charlie", "echo bravo edited"]);
    await shot("b3-reordered");
    const file = savedInstructions();
    if (file.join() !== "echo alpha,echo charlie,echo bravo edited") throw new Error(`queue file holds ${JSON.stringify(file)}`);
    return { panel: rows, file };
  }],
  ["b4", "cancel the first message", async () => {
    await rowButton(0, "Remove").click();
    const rows = await waitRows(["echo charlie", "echo bravo edited"]);
    await shot("b4-cancelled");
    const file = savedInstructions();
    if (file.join() !== "echo charlie,echo bravo edited") throw new Error(`queue file holds ${JSON.stringify(file)}`);
    ctx.saved = queueFile();
    return { panel: rows, file };
  }],
  ["b5", "quit the app mid-run, relaunch, reopen the chat: the remaining queue is intact and not running", async () => {
    const before = ctx.model.requests.length;
    await ctx.cur.app.close().catch(() => undefined);
    await sleep(2500);
    ctx.model.release();
    killLeftovers(ctx.box);
    await sleep(500);
    // Negative control: with the saved queue deleted, this step must fail, proving it can.
    if (option("--control", "") === "wipe-queue") fs.rmSync(path.join(ctx.box.vantaHome, "desktop-turn-queues"), { recursive: true, force: true });
    const onDisk = queueFile();
    if (onDisk.items.map((item) => item.instruction).join() !== "echo charlie,echo bravo edited") throw new Error(`after quit the queue file holds ${JSON.stringify(onDisk.items.map((i) => i.instruction))}`);
    await openApp();
    // The app reopens the last chat; if it did not, open the interrupted one from the sidebar.
    const rows = await waitRows(["echo charlie", "echo bravo edited"], 6000).catch(async () => {
      await page().locator("[data-tour='sessions-sidebar']").getByText("hold the line", { exact: false }).first().click();
      return waitRows(["echo charlie", "echo bravo edited"]);
    });
    await waitText("Not running. Saved messages start when you run the queue.");
    await shot("b5-after-restart");
    const ranSinceRestart = ctx.model.requests.slice(before).filter((r) => r.lastUser.startsWith("echo")).length;
    if (ranSinceRestart) throw new Error(`${ranSinceRestart} queued message(s) ran on their own after the restart`);
    return { panel: rows, file: onDisk.items.map((item) => item.instruction), ranOnTheirOwn: ranSinceRestart };
  }],
  ["b6", "Run queue: the queued turns execute in the edited order and the queue empties", async () => {
    const before = ctx.model.requests.length;
    await page().getByRole("button", { name: "Run queue", exact: true }).click();
    await waitText("echo: bravo edited", { timeout: 40_000 });
    const ran = ctx.model.requests.slice(before).filter((r) => r.turnStart && r.lastUser.startsWith("echo")).map((r) => r.lastUser);
    await waitRows([], 15_000).catch(() => undefined);
    await shot("b6-ran");
    const left = savedInstructions();
    const text = await bodyText();
    const failures = [];
    if (ran.join() !== "echo charlie,echo bravo edited") failures.push(`the model was asked ${JSON.stringify(ran)}, expected charlie then bravo edited`);
    if (left.length) failures.push(`queue file still holds ${JSON.stringify(left)}`);
    if (!text.includes("echo: bravo edited")) failures.push("the answer to the last queued message is not on screen");
    if ((await page().locator(QUEUE_ROWS).count()) !== 0) failures.push("the queue panel still shows rows");
    if (failures.length) throw new Error(failures.join("; "));
    return { askedInOrder: ran, fileAfter: left };
  }],
  ["b7", "after another restart the chat shows both queued messages and their answers, in the edited order", async () => {
    await restartApp();
    const reopened = async () => (await bodyText()).includes("echo: bravo edited");
    if (!(await reopened().catch(() => false))) await page().locator("[data-tour='sessions-sidebar']").getByText("hold the line", { exact: false }).first().click();
    await waitText("echo: bravo edited");
    await sleep(800);
    const text = await bodyText();
    const order = ["echo charlie", "echo: charlie", "echo bravo edited", "echo: bravo edited"].map((needle) => text.indexOf(needle));
    await shot("b7-reopened");
    if (order.some((i) => i < 0) || order.some((i, k) => k && i < order[k - 1])) throw new Error(`thread order is ${JSON.stringify(order)} for charlie, answer, bravo edited, answer`);
    return { positions: order };
  }],
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  ctx.box = await makeSandbox();
  ctx.model = await startScriptedModel();
  let failed = false;
  try {
    await openApp();
    for (const [id, title, fn] of STEPS) {
      if (failed) { ctx.steps.push({ id, title, status: "SKIPPED" }); continue; }
      const started = Date.now();
      try {
        const detail = await fn();
        ctx.steps.push({ id, title, status: "PASS", ms: Date.now() - started, detail });
      } catch (error) {
        failed = true;
        await shot(`FAIL-${id}`);
        ctx.steps.push({ id, title, status: "FAIL", ms: Date.now() - started, error: String(error.message ?? error).split("\n").slice(0, 3).join(" ").slice(0, 600) });
      }
    }
  } finally {
    const errors = ctx.cur?.errors ?? [];
    ctx.model.release();
    await ctx.cur?.app.close().catch(() => undefined);
    await ctx.model.close();
    killLeftovers(ctx.box);
    if (!flag("--keep")) fs.rmSync(ctx.box.root, { recursive: true, force: true });
    const result = { sandbox: flag("--keep") ? ctx.box.root : "(removed)", steps: ctx.steps, consoleErrors: errors.slice(0, 10), pass: ctx.steps.every((s) => s.status === "PASS") };
    fs.writeFileSync(path.join(outDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result));
    process.exit(result.pass ? 0 : 1);
  }
}

await main();
