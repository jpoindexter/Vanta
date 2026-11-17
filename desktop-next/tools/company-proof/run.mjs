// Company-complete proof, one run: the real Electron shell + real Vanta server and kernel in a sandbox
// (own VANTA_HOME, HOME, userData, ports), a scripted local model, and NO external agent CLI. Drives the Company
// screens: hire a worker, create and run a ticket, create an OKR and update its progress, queue a second ticket,
// press Run tick, and watch the heartbeat and a new work product appear without leaving the screen.
//
//   node tools/company-proof/run.mjs --out docs/proofs/company-complete/run-01 [--no-shots] [--keep] [--control no-department]
// --fresh-tick adds step a2: a tick before any worker has run must already see the kernel goal.
// --control no-department skips the department file: the tick must then NOT start T-2 and the proof must fail at step h.
import fs from "node:fs";
import path from "node:path";

import { killLeftovers, launchApp, makeSandbox } from "../done-path/harness.mjs";
import { sleep } from "../done-path/lib.mjs";
import { startScriptedModel } from "../done-path/scripted-model.mjs";
import { waitForShell } from "../vanta-app.mjs";
import { addKernelGoal, bridgeCall, writeDepartment } from "./seed.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = path.resolve(option("--out", path.join(import.meta.dirname, "..", "..", "docs", "proofs", "company-complete", `run-${Date.now()}`)));
const TIMEOUT = 20_000;
const ANSWER = "Scripted turn finished.";

const ctx = { box: null, cur: null, model: null, steps: [], facts: {} };
const page = () => ctx.cur.page;
const shot = (name) => (flag("--no-shots") ? undefined : page().screenshot({ path: path.join(outDir, `${name}.png`) }).catch(() => undefined));
const bodyText = () => page().evaluate(() => document.body.innerText);
const openTab = async (name) => { await page().getByRole("tab", { name, exact: true }).click(); await sleep(500); };
const expectText = async (text, timeout = TIMEOUT) => page().getByText(text).first().waitFor({ state: "visible", timeout });
const apiGet = async (route) => { const r = await bridgeCall(page(), "GET", route); if (!r.ok) throw new Error(`GET ${route} -> ${r.status}`); return r.data; };
const must = (cond, message) => { if (!cond) throw new Error(message); };

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

const STEPS = [
  ["a", "Company opens on Workers with the new tabs present and an empty roster", async () => {
    await page().getByRole("button", { name: "Company" }).first().click();
    await page().getByRole("region", { name: "Company" }).waitFor({ timeout: TIMEOUT });
    await expectText("No workers yet");
    const tabs = await page().getByRole("tab").allTextContents();
    for (const name of ["OKRs", "Heartbeats", "Work products"]) must(tabs.includes(name), `tab ${name} missing: ${tabs.join(", ")}`);
    await shot("01-workers-empty");
    return { tabs };
  }],
  ["a2", "fresh app, no worker has run: Run tick still sees a goal on the running kernel (--fresh-tick)", async () => {
    if (!flag("--fresh-tick")) return { skipped: true };
    const goalId = await addKernelGoal(ctx.box);
    ctx.facts.goalId = goalId;
    writeDepartment(ctx.box, "engineer", goalId);
    const tick = await bridgeCall(page(), "POST", "/api/company/tick", {});
    must(tick.ok, `tick: ${JSON.stringify(tick).slice(0, 300)}`);
    const warnings = tick.data.warnings ?? [];
    must(!warnings.some((w) => /kernel goals/i.test(w)), `tick still reports no goals: ${warnings.join(" | ")}`);
    return { goalId, warnings };
  }],
  ["b", "hire an Engineer with a $2 budget through the approval card", async () => {
    await page().getByTestId("hire-open").click();
    const dialog = page().getByRole("dialog", { name: "Hire worker" });
    await dialog.waitFor();
    await dialog.getByLabel("Role").fill("Engineer");
    // The provider list loads after the dialog opens; choose the sandbox's endpoint explicitly.
    await waitFor(async () => (await dialog.getByLabel("Provider").evaluate((el) => el.tagName).catch(() => "")) === "SELECT", "the provider list to load");
    await dialog.getByLabel("Provider").selectOption({ label: "Custom OpenAI-compatible endpoint" });
    await dialog.getByLabel("Budget (US dollars)").fill("2");
    await dialog.getByRole("button", { name: "Hire and ask me to approve" }).click();
    await page().locator("[data-vp='approval-card']").waitFor({ timeout: TIMEOUT });
    await shot("02-hire-approval");
    await page().getByRole("button", { name: "Allow once" }).click();
    await expectText("Hired Engineer.");
    const company = await apiGet("/api/company");
    must(company.workers.length === 1 && company.workers[0].id === "engineer", `roster: ${JSON.stringify(company.workers.map((w) => w.id))}`);
    return { worker: company.workers[0].id, adapter: company.workers[0].runtime };
  }],
  ["c", "create a ticket assigned to the Engineer: it runs on the scripted model and finishes in review", async () => {
    await openTab("Tickets");
    await page().getByTestId("ticket-create-open").click();
    const dialog = page().getByRole("dialog", { name: "New ticket" });
    await dialog.getByLabel("Title").fill("Write a one line project summary");
    await dialog.getByLabel("Expected output (optional)").fill("report");
    await dialog.getByLabel("Assign to (optional)").selectOption({ label: "Engineer" });
    await dialog.getByRole("button", { name: "Create ticket" }).click();
    const ticket = await waitFor(async () => { const t = await apiGet("/api/tickets/T-1"); return t.status === "in_review" ? t : null; }, "T-1 to reach in_review", 40_000);
    ctx.facts.heartbeatAfterFirstRun = (await apiGet("/api/heartbeats")).workers[0];
    await shot("03-ticket-in-review");
    return { status: ticket.status, products: ticket.workProducts.length, runs: ticket.runs.map((r) => ({ runtime: r.runtime, status: r.status })) };
  }],
  ["d", "Work products lists the report with its preview, producer and a link to the ticket", async () => {
    await openTab("Work products");
    const card = page().getByTestId("work-product").first();
    await card.waitFor({ timeout: TIMEOUT });
    const text = await card.innerText();
    must(text.includes(ANSWER), `preview lacks the model's answer: ${text.slice(0, 200)}`);
    must(text.includes("by Engineer") && text.includes("T-1"), `provenance missing: ${text.slice(0, 200)}`);
    await card.getByRole("button", { name: "Open ticket T-1" }).waitFor();
    must((await page().getByTestId("work-product").count()) === 1, "expected exactly one work product");
    await shot("04-work-products-one");
    return { count: 1, summary: await page().getByTestId("products-summary").innerText() };
  }],
  ["e", "OKRs: empty, create an objective with a key result, update its progress, and it is stored", async () => {
    await openTab("OKRs");
    await expectText("No objectives yet");
    await shot("05-okrs-empty");
    await page().getByTestId("okr-create-open").click();
    const dialog = page().getByRole("dialog", { name: "New objective" });
    await dialog.getByLabel("Objective", { exact: true }).fill("Grow revenue");
    await dialog.getByLabel("Name", { exact: true }).fill("Paying customers");
    await dialog.getByLabel("Target", { exact: true }).fill("100");
    await dialog.getByLabel("Current", { exact: true }).fill("10");
    await dialog.getByRole("button", { name: "Create objective" }).click();
    const card = page().getByTestId("objective").first();
    await card.waitFor({ timeout: TIMEOUT });
    await expectText("10 of 100 · 10%");
    await card.getByLabel("Current value for Paying customers").fill("40");
    await card.getByRole("button", { name: "Save progress for Paying customers" }).click();
    await expectText("40 of 100 · 40%");
    const stored = JSON.parse(fs.readFileSync(path.join(ctx.box.vantaHome, "okrs.json"), "utf8"));
    must(stored.objectives[0].keyResults[0].current === 40, `okrs.json: ${JSON.stringify(stored)}`);
    await shot("06-okrs-progress");
    return { stored: stored.objectives[0].keyResults[0], progressShown: "40 of 100 · 40%" };
  }],
  ["f", "setup outside the UI: a kernel goal, the department, and ticket T-2 queued for the Engineer without starting", async () => {
    await openTab("Tickets");
    await page().getByTestId("ticket-create-open").click();
    const dialog = page().getByRole("dialog", { name: "New ticket" });
    await dialog.getByLabel("Title").fill("Draft the weekly update");
    await dialog.getByLabel("Expected output (optional)").fill("report");
    await dialog.getByRole("button", { name: "Create ticket" }).click();
    await waitFor(async () => (await apiGet("/api/tickets")).tickets.some((t) => t.id === "T-2"), "T-2 to exist");
    const goalId = ctx.facts.goalId ?? (await addKernelGoal(ctx.box));
    if (option("--control", "") !== "no-department") writeDepartment(ctx.box, "engineer", goalId);
    const assigned = await bridgeCall(page(), "POST", "/api/company/tickets/assign", { ticketId: "T-2", workerId: "engineer", start: false });
    must(assigned.ok && assigned.data.run === undefined, `assign: ${JSON.stringify(assigned).slice(0, 300)}`);
    const t2 = await apiGet("/api/tickets/T-2");
    must(t2.status === "assigned", `T-2 should be queued, is ${t2.status}`);
    ctx.facts.goalId = goalId;
    return { goalId, t2: t2.status };
  }],
  ["g", "Heartbeats before the tick: the Engineer's next up is T-2, one report exists, no wakeup runs", async () => {
    await openTab("Heartbeats");
    const row = page().getByTestId("heartbeat-row").first();
    await row.waitFor({ timeout: TIMEOUT });
    await waitFor(async () => (await row.innerText()).includes("T-2"), "Next up to show T-2");
    ctx.facts.before = { row: (await row.innerText()).replace(/\s+/g, " "), api: (await apiGet("/api/heartbeats")).workers[0], products: (await apiGet("/api/work-products")).workProducts.length };
    must(ctx.facts.before.products === 1, `products before: ${ctx.facts.before.products}`);
    await expectText("No wakeup runs recorded yet");
    await shot("07-heartbeats-before-tick");
    return ctx.facts.before;
  }],
  ["h", "Run tick: busy state, then a result naming the department and T-2; the table and the work product follow without leaving the tab", async () => {
    const button = page().getByTestId("tick-run");
    await button.click();
    const result = page().getByTestId("tick-result");
    await result.waitFor({ timeout: 30_000 });
    const text = (await result.innerText()).replace(/\s+/g, " ");
    must(text.includes("1 of 1 department advanced."), `tick headline: ${text}`);
    must(text.includes("product: started a ticket T-2"), `tick beat: ${text}`);
    await shot("08-tick-result");
    // Live refresh: the same tab, no navigation. T-2 leaves "Next up" once its run starts.
    const row = page().getByTestId("heartbeat-row").first();
    await waitFor(async () => !(await row.innerText()).includes("T-2") || (await row.innerText()).includes("Nothing queued"), "Next up to drop T-2 (live refresh)", 30_000);
    const t2 = await waitFor(async () => { const t = await apiGet("/api/tickets/T-2"); return t.status === "in_review" ? t : null; }, "T-2 to finish", 40_000);
    const after = (await apiGet("/api/heartbeats")).workers[0];
    must(after.lastHeartbeat > ctx.facts.before.api.lastHeartbeat, `heartbeat did not advance: ${ctx.facts.before.api.lastHeartbeat} -> ${after.lastHeartbeat}`);
    await shot("09-heartbeats-after-tick");
    return { tick: text, t2: t2.status, t2Runs: t2.runs.length, heartbeatBefore: ctx.facts.before.api.lastHeartbeat, heartbeatAfter: after.lastHeartbeat, rowAfter: (await row.innerText()).replace(/\s+/g, " ") };
  }],
  ["i", "Work products now lists two: the second came from the tick", async () => {
    await openTab("Work products");
    await waitFor(async () => (await page().getByTestId("work-product").count()) === 2, "two work products");
    const first = (await page().getByTestId("work-product").first().innerText()).replace(/\s+/g, " ");
    must(first.includes("T-2"), `newest product should be T-2: ${first.slice(0, 160)}`);
    await page().getByLabel("Ticket", { exact: true }).selectOption({ label: "T-1: Write a one line project summary" });
    await waitFor(async () => (await page().getByTestId("work-product").count()) === 1, "filter by ticket T-1");
    await shot("10-work-products-filtered");
    await page().getByLabel("Ticket", { exact: true }).selectOption({ label: "All tickets" });
    return { newest: first.slice(0, 160), filterByTicketWorks: true };
  }],
  ["j", "a second tick with nothing queued says so, and works from the keyboard alone", async () => {
    await openTab("Heartbeats");
    const button = page().getByTestId("tick-run");
    await button.focus();
    await page().keyboard.press("Enter");
    const result = page().getByTestId("tick-result");
    await waitFor(async () => (await result.count()) > 0 && (await result.innerText()).includes("skipped: no queued ticket"), "an idle tick result");
    const text = (await result.innerText()).replace(/\s+/g, " ");
    must(text.includes("0 of 1 department advanced."), `idle tick: ${text}`);
    await shot("11-tick-idle-by-keyboard");
    return { tick: text };
  }],
  ["k", "Activity recorded the OKR writes and both ticks; no page errors", async () => {
    const entries = (await apiGet("/api/activity?limit=200")).entries;
    const kinds = entries.map((e) => e.kind);
    for (const kind of ["okr.created", "okr.progress", "company.tick"]) must(kinds.includes(kind), `activity lacks ${kind}: ${[...new Set(kinds)].join(", ")}`);
    const expectedTicks = flag("--fresh-tick") ? 3 : 2;
    must(kinds.filter((k) => k === "company.tick").length === expectedTicks, `expected ${expectedTicks} ticks in the log, saw ${kinds.filter((k) => k === "company.tick").length}`);
    // "unsupported: <vanta call> is not available in Vanta Desktop yet" is the shell's known, pre-existing stub noise.
    const errors = ctx.cur.errors.filter((e) => !/favicon|ResizeObserver|is not available in Vanta Desktop yet/.test(e));
    must(errors.length === 0, `console errors: ${errors.slice(0, 3).join(" | ")}`);
    return { kinds: [...new Set(kinds)] };
  }],
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  ctx.box = await makeSandbox();
  ctx.model = await startScriptedModel();
  let failed = false;
  try {
    ctx.cur = await launchApp({ box: ctx.box, project: ctx.box.projectA, modelUrl: ctx.model.url });
    await waitForShell(page());
    page().setDefaultTimeout(TIMEOUT);
    for (const [id, title, fn] of STEPS) {
      if (failed) { ctx.steps.push({ id, title, status: "SKIPPED" }); continue; }
      const started = Date.now();
      try {
        const detail = await fn();
        ctx.steps.push({ id, title, status: "PASS", ms: Date.now() - started, detail });
      } catch (error) {
        failed = true;
        await page().screenshot({ path: path.join(outDir, `FAIL-${id}.png`) }).catch(() => undefined);
        ctx.steps.push({ id, title, status: "FAIL", ms: Date.now() - started, error: String(error.message ?? error).split("\n").slice(0, 3).join(" ").slice(0, 600) });
      }
    }
  } finally {
    const errors = ctx.cur?.errors ?? [];
    await ctx.cur?.app.close().catch(() => undefined);
    await ctx.model.close();
    killLeftovers(ctx.box);
    if (!flag("--keep")) fs.rmSync(ctx.box.root, { recursive: true, force: true });
    const result = { sandbox: flag("--keep") ? ctx.box.root : "(removed)", modelRequests: ctx.model.requests.length, steps: ctx.steps, consoleErrors: errors.slice(0, 10), pass: ctx.steps.every((s) => s.status === "PASS") };
    fs.writeFileSync(path.join(outDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result));
    process.exit(result.pass ? 0 : 1);
  }
}

await main();
