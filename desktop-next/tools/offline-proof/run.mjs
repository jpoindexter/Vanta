// Real-app proof for two things the unit tests only cover in jsdom:
//   a  online baseline: a message is answered by the scripted model
//   b  the runtime is killed: the offline banner shows and the composer stays usable
//   c  a message typed while offline is queued: the draft clears, nothing reaches the model
//   d  "Retry now" brings the backend back (the runtime is started again) and the queued message runs
//   e  Memory Graph opens from the command palette and loads (runs even if the offline steps failed)
//
//   node tools/offline-proof/run.mjs --out docs/proofs/offline-queue/run-01 [--keep] [--no-shots]
// Sandboxed VANTA_HOME and user data, a private kernel port and a scripted local model: nothing touches ~/.vanta.
import fs from "node:fs";
import path from "node:path";

import { commandOf, descendants, killLeftovers, launchApp, makeSandbox } from "../done-path/harness.mjs";
import { sleep } from "../done-path/lib.mjs";
import { startScriptedModel } from "../done-path/scripted-model.mjs";
import { waitForShell } from "../vanta-app.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = path.resolve(option("--out", path.join(import.meta.dirname, "..", "..", "docs", "proofs", "offline-queue", `run-${Date.now()}`)));
const TIMEOUT = 20_000;
const OFFLINE_TEXT = "offline question that must wait";
const ANSWER = "Scripted turn finished.";
const SKILL_NAME = "Invoice triage";
const MEMORY_TITLE = "Prefers short answers";
const RESPAWN_DELAY_MS = 9000;

const ctx = { box: null, cur: null, model: null, steps: [], facts: {} };
const page = () => ctx.cur.page;
const shot = (name) => (flag("--no-shots") ? undefined : page().screenshot({ path: path.join(outDir, `${name}.png`) }).catch(() => undefined));
const bodyText = () => page().evaluate(() => document.body.innerText);
const must = (cond, message) => { if (!cond) throw new Error(message); };
const composer = () => page().locator("[data-vp='composer-input']").first();

async function waitFor(read, describe, timeout = TIMEOUT) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await read();
    if (last) return last;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${describe}`);
}

/** The Vanta runtime is the node process under the Electron main that runs the desktop server. */
function runtimePid() {
  return descendants(ctx.cur.pid).find((pid) => /cli\.(mjs|ts)/.test(commandOf(pid)) && /desktop/.test(commandOf(pid)));
}

async function send(text) {
  await composer().click();
  await page().keyboard.type(text);
  await page().keyboard.press("Enter");
}

const promptsContaining = (needle) => ctx.model.requests.filter((r) => String(r.prompt ?? "").includes(needle)).length;

/** One learned skill and one memory, so the Memory Graph has something to draw. */
function seedLearning(box) {
  const skill = path.join(box.vantaHome, "skills", "invoice-triage");
  fs.mkdirSync(skill, { recursive: true });
  fs.writeFileSync(path.join(skill, "SKILL.md"), `---\nname: ${SKILL_NAME}\ndescription: Triage incoming invoices\ntags: [finance]\n---\nOpen the inbox, sort invoices by due date.\n`);
  fs.mkdirSync(path.join(box.vantaHome, "memories"), { recursive: true });
  fs.writeFileSync(path.join(box.vantaHome, "memories", "1.md"), `# ${MEMORY_TITLE}\nKeep replies under five lines.\n`);
}

const STEPS = [
  ["a", "online baseline: a typed message is answered", async () => {
    await page().locator('[data-tour="sidebar-nav-new-session"]').click();
    await composer().waitFor({ state: "visible", timeout: TIMEOUT });
    await send("baseline question");
    await waitFor(async () => (await bodyText()).includes(ANSWER), "the scripted answer");
    ctx.facts.requestsBefore = ctx.model.requests.length;
    return { requests: ctx.facts.requestsBefore };
  }],
  ["b", "the runtime is killed: the offline banner shows and the composer stays usable", async () => {
    const pid = runtimePid();
    must(pid, "no runtime process under the app");
    process.kill(pid, "SIGKILL");
    await page().getByTestId("offline-banner").waitFor({ state: "visible", timeout: 30_000 });
    // The crash toast is sticky and shares the top of the window with the banner: it must sit below it.
    const toast = page().getByText("Vanta stopped working in the background");
    await toast.waitFor({ state: "visible", timeout: 10_000 });
    const gap = await page().evaluate(() => {
      const banner = document.querySelector("[data-testid='offline-banner']").getBoundingClientRect();
      const stack = document.querySelector("[data-slot='notification-stack']").getBoundingClientRect();
      return { bannerBottom: Math.round(banner.bottom), toastTop: Math.round(stack.top) };
    });
    must(gap.toastTop >= gap.bannerBottom, `the toast (top ${gap.toastTop}) covers the offline banner (bottom ${gap.bannerBottom})`);
    ctx.facts.gap = gap;
    await shot("03-offline-banner");
    must(await composer().isEditable(), "the composer is not editable while offline");
    return { killed: pid, ...ctx.facts.gap, banner: (await page().getByTestId("offline-banner").innerText()).replace(/\s+/g, " ").slice(0, 120) };
  }],
  ["c", "a message typed while offline is queued: the draft clears and nothing reaches the model", async () => {
    await send(OFFLINE_TEXT);
    await waitFor(async () => (await composer().innerText()).trim() === "", "the composer to clear after Enter");
    await page().waitForTimeout(800);
    await shot("04-queued-offline");
    must(promptsContaining(OFFLINE_TEXT) === 0, "the model received the message while offline");
    must((await bodyText()).includes(OFFLINE_TEXT), "the queued message is not visible anywhere on screen");
    return { visible: true };
  }],
  ["d", "Retry now brings the backend back and the queued message runs", async () => {
    // Retry while the restart is still pending: it joins that restart instead of starting a second one.
    // Best effort: the banner (and its button) goes away as soon as the backend is back.
    const retried = await page().getByRole("button", { name: "Retry now" }).click({ timeout: 3000 }).then(() => true, () => false);
    ctx.facts.retryClicked = retried;
    must(retried, "Retry now was not clickable while the backend was down");
    await waitFor(async () => promptsContaining(OFFLINE_TEXT) > 0, "the queued message to reach the model", 60_000);
    await waitFor(async () => (await bodyText()).split(ANSWER).length - 1 >= 2, "the second answer", 30_000);
    await shot("05-drained");
    must(!(await page().getByTestId("offline-banner").isVisible().catch(() => false)), "the offline banner is still showing after the backend came back");
    must(!(await page().getByText("Vanta stopped working in the background").isVisible().catch(() => false)), "the crash toast is still showing after the backend came back");
    return { requestsAfter: ctx.model.requests.length, retryClicked: retried };
  }],
  ["e", "Memory Graph opens from the command palette and draws the seeded skill and memory", async () => {
    await page().keyboard.press("Meta+k");
    await page().waitForTimeout(500);
    await page().keyboard.type("memory graph");
    await page().getByText("Memory Graph", { exact: true }).first().waitFor({ state: "visible", timeout: TIMEOUT });
    await shot("06-palette-memory-graph");
    await page().keyboard.press("Enter");
    await waitFor(async () => /#\/starmap/.test(page().url()), "the Memory Graph route");
    await waitFor(async () => !/Could not load memory graph/.test(await bodyText()), "the graph to load without an error");
    // The graph is drawn on a canvas, so node names are not page text; the legend and key are.
    await waitFor(async () => /core = oldest/.test(await bodyText()), "the graph legend (a loaded graph, not the empty state)");
    await shot("07-memory-graph");
    const text = await bodyText();
    must(!/Nothing learned yet/.test(text), "the graph shows the empty state although a skill and a memory exist");
    must(/skill/.test(text) && /memory/.test(text), "the legend lacks the skill or memory entry");
    const counter = (text.match(/\d+ \/ \d+/) ?? [""])[0];
    await page().keyboard.press("Escape");
    await page().evaluate(() => { window.location.hash = "#/"; });
    await page().waitForTimeout(500);
    return { legend: true, counter };
  }],
  ["f", "the toast's Restart Vanta brings a killed backend back at once (not after the automatic delay)", async () => {
    const before = ctx.model.requests.length;
    const pid = runtimePid();
    must(pid, "no runtime process under the app");
    process.kill(pid, "SIGKILL");
    await page().getByText("Vanta stopped working in the background").waitFor({ state: "visible", timeout: 30_000 });
    const started = Date.now();
    await page().getByRole("button", { name: "Restart Vanta" }).click({ timeout: 5000 });
    await page().getByTestId("offline-banner").waitFor({ state: "hidden", timeout: 20_000 });
    const ms = Date.now() - started;
    must(ms < RESPAWN_DELAY_MS - 2000, `the backend took ${ms} ms to return: Restart waited for the automatic delay`);
    await waitFor(async () => !(await page().getByText("Vanta stopped working in the background").isVisible().catch(() => false)), "the crash toast to clear");
    await shot("08-restart-vanta");
    return { backAfterMs: ms, killed: pid, requestsBefore: before };
  }],
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  ctx.box = await makeSandbox();
  seedLearning(ctx.box);
  ctx.model = await startScriptedModel();
  let failed = false;
  try {
    // The runtime is started again after a crash; the delay keeps the app offline long enough to type into it.
    ctx.cur = await launchApp({ box: ctx.box, project: ctx.box.projectA, modelUrl: ctx.model.url, extraEnv: { VANTA_DESKTOP_RESPAWN_DELAY_MS: String(RESPAWN_DELAY_MS) } });
    await waitForShell(page());
    page().setDefaultTimeout(TIMEOUT);
    for (const [id, title, fn] of STEPS) {
      // Memory Graph (e) does not depend on the offline flow, so it runs whatever happened before it.
      if (failed && id !== "e") { ctx.steps.push({ id, title, status: "SKIPPED" }); continue; }
      const started = Date.now();
      try {
        const detail = await fn();
        ctx.steps.push({ id, title, status: "PASS", ms: Date.now() - started, detail });
      } catch (error) {
        if (id !== "e") failed = true;
        await page().screenshot({ path: path.join(outDir, `FAIL-${id}.png`) }).catch(() => undefined);
        ctx.steps.push({ id, title, status: "FAIL", ms: Date.now() - started, error: String(error.message ?? error).split("\n").slice(0, 3).join(" ").slice(0, 600) });
      }
    }
  } finally {
    const errors = ctx.cur?.errors ?? [];
    await ctx.cur?.app.close().catch(() => undefined);
    await ctx.model.close();
    killLeftovers(ctx.box);
    const logFile = path.join(ctx.box.userData, "logs", "runtime.log");
    if (fs.existsSync(logFile)) fs.copyFileSync(logFile, path.join(outDir, "runtime.log"));
    if (!flag("--keep")) fs.rmSync(ctx.box.root, { recursive: true, force: true });
    const result = { sandbox: flag("--keep") ? ctx.box.root : "(removed)", modelRequests: ctx.model.requests.length, steps: ctx.steps, consoleErrors: errors.slice(0, 10), pass: ctx.steps.every((s) => s.status === "PASS") };
    fs.writeFileSync(path.join(outDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result));
    process.exit(result.pass ? 0 : 1);
  }
}

await main();
