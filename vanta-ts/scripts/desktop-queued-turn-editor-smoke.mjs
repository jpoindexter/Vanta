import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { _electron as electron } from "playwright-core";
import { scanAccessibility } from "./lib/desktop-accessibility-proof.mjs";

const home = await mkdtemp(join(tmpdir(), "vanta-desktop-queue-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-queue-profile-"));
const project = await mkdtemp(join(tmpdir(), "vanta-desktop-queue-project-"));
const port = process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7957";
const executablePath = process.env.VANTA_DESKTOP_APP;
const accessibilityProof = process.env.VANTA_DESKTOP_ACCESSIBILITY_PROOF === "1";
const accessibilityResults = [];
const rendererErrors = [];
const queue = [];
let revision = 0;
let sequence = 0;
let failNextGet = false;
let releaseChat = () => {};
let app;

try {
  await mkdir(join(home, "sessions"), { recursive: true });
  await writeFile(join(project, "README.md"), "# Queue proof\n", "utf8");
  await writeFile(join(home, "sessions", "queue-proof.json"), JSON.stringify({
    id: "queue-proof", title: "Queue editor proof", started: "2026-07-17T12:00:00.000Z", updated: "2026-07-17T12:00:00.000Z",
    messages: [{ role: "user", content: "Prepare the current proof." }, { role: "assistant", content: "Current proof ready." }],
  }), "utf8");

  app = await launch();
  let page = await readyPage(app);
  await installRoutes(page);
  await openProofSession(page);
  await startLongTurn(page);
  await queueInstruction(page, "Run source proof");
  await queueInstruction(page, "Run packaged proof");

  await page.getByRole("button", { name: "Open queued turns, 2 queued" }).click();
  await page.getByRole("dialog", { name: "Queued turns 2" }).waitFor();
  assert.equal(await page.locator(".queued-turn-list li").count(), 2);
  if (accessibilityProof) accessibilityResults.push(await scanAccessibility(page, "queue"));
  await editFirst(page, "Run source proof with receipts");
  await page.locator(".queued-turn-list li").nth(1).getByRole("button", { name: "Move queued turn up" }).click();
  await expectFirst(page, "Run packaged proof");
  await page.locator(".queued-turn-list li").first().getByRole("button", { name: "Steer with this turn next" }).click();
  await page.locator(".queued-turn-list li").nth(1).getByRole("button", { name: "Cancel queued turn" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".queued-turn-list li").length === 1);
  await expectFirst(page, "Run packaged proof");
  await page.getByText("Steers the next turn").waitFor();

  queue[0].status = "starting";
  queue[0].revision += 1;
  revision += 1;
  await page.waitForFunction(() => document.querySelector(".queued-turn-list li")?.getAttribute("data-status") === "starting");
  assert.equal(await page.locator(".queued-turn-list li button:disabled").count(), 5, "a starting turn must lock every mutation");

  failNextGet = true;
  await page.getByText("Queue connection interrupted.").waitFor();
  await page.getByText("Queue connection interrupted.").waitFor({ state: "detached", timeout: 4_000 });
  await page.setViewportSize({ width: 760, height: 700 });
  const compact = await page.locator(".queue-drawer").evaluate((element) => ({ width: element.getBoundingClientRect().width, viewport: window.innerWidth, overflow: document.documentElement.scrollWidth - window.innerWidth }));
  assert.equal(compact.width, compact.viewport, `compact queue drawer should fill the viewport: ${JSON.stringify(compact)}`);
  assert.ok(compact.overflow <= 1, `compact queue drawer must not overflow: ${JSON.stringify(compact)}`);
  await page.getByRole("button", { name: "Close queued turns" }).click();
  releaseChat();
  await page.getByRole("button", { name: "Send" }).waitFor();

  await app.close();
  app = undefined;
  await delay(200);
  app = await launch();
  page = await readyPage(app);
  await installRoutes(page);
  await openProofSession(page);
  await page.getByRole("button", { name: /Open queued turns/ }).click();
  await page.getByText("Run packaged proof").waitFor();
  await page.getByText("Starting now").waitFor();
  if (rendererErrors.length) throw new Error(`Renderer errors: ${rendererErrors.join(" | ")}`);
  process.stdout.write(`${JSON.stringify({ ok: true, target: executablePath ? "packaged" : "source", enqueue: true, edit: true, reorder: true, steer: true, cancel: true, startingRace: true, reconnect: true, relaunch: true, compact: "760x700", persistedScope: ["controller", "model", "approval"], accessibilityProof: accessibilityProof ? accessibilityResults : undefined })}\n`);
} finally {
  releaseChat();
  await app?.close().catch(() => undefined);
  await Promise.all([rm(home, { recursive: true, force: true }), rm(userData, { recursive: true, force: true }), rm(project, { recursive: true, force: true })]);
}

async function launch() {
  return electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", project] : ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: { ...process.env, VANTA_HOME: home, VANTA_DESKTOP_USER_DATA: userData, VANTA_DESKTOP_PORT: port, VANTA_DESKTOP_AUTOMATION: "1", OPENAI_API_KEY: "vanta-queue-proof-key", ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
  });
}

async function readyPage(instance) {
  const page = await instance.firstWindow();
  await page.setViewportSize({ width: 1440, height: 960 });
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => rendererErrors.push(`page error: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("Failed to load resource")) rendererErrors.push(`console error: ${message.text()}`); });
  await page.locator(".app-shell").waitFor();
  return page;
}

async function installRoutes(page) {
  await page.route("**/api/chat", async (route) => {
    await new Promise((resolve) => { releaseChat = resolve; });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ finalText: "Primary turn complete.", events: [{ label: "done", ok: true }] }) });
  });
  await page.route("**/api/chat/queue", async (route) => {
    if (route.request().method() === "GET") {
      if (failNextGet) {
        failNextGet = false;
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Queue connection interrupted." }) });
      } else await route.fulfill(jsonResponse(snapshot()));
      return;
    }
    const body = route.request().postDataJSON();
    if (!body.action) {
      const now = "2026-07-17T12:00:00.000Z";
      queue.push({ id: `q-${++sequence}`, instruction: body.message, intent: "next", status: "queued", revision: 1, position: queue.length + 1, createdAt: now, updatedAt: now, target: { sessionId: "queue-proof", root: project, controllerId: "Local Mac", model: "gpt-5.6-terra", accessMode: "approve" } });
    } else {
      const index = queue.findIndex((item) => item.id === body.id);
      const item = queue[index];
      if (!item || item.revision !== body.revision || item.status !== "queued") {
        await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "This queued turn has already started." }) });
        return;
      }
      if (body.action === "edit") item.instruction = body.message;
      if (body.action === "move") {
        const destination = index + (body.direction === "up" ? -1 : 1);
        if (queue[destination]) [queue[index], queue[destination]] = [queue[destination], queue[index]];
      }
      if (body.action === "steer") { item.intent = "steer"; queue.splice(index, 1); queue.unshift(item); }
      if (body.action === "cancel") queue.splice(index, 1);
      item.revision += 1;
    }
    revision += 1;
    await route.fulfill(jsonResponse(body.action ? snapshot() : { queued: true, item: queue.at(-1), snapshot: snapshot() }, body.action ? 200 : 202));
  });
}

function snapshot() { return { revision, items: queue }; }
function jsonResponse(body, status = 200) { return { status, contentType: "application/json", body: JSON.stringify(body) }; }

async function openProofSession(page) {
  const session = page.locator(".session-list .session").filter({ hasText: "Queue editor proof" }).first();
  await session.waitFor();
  await session.click();
  await page.getByText("Current proof ready.").waitFor();
}

async function startLongTurn(page) {
  await page.getByLabel("Message Vanta").fill("Keep the primary turn running");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("button", { name: "Queue", exact: true }).waitFor();
}

async function queueInstruction(page, instruction) {
  await page.getByLabel("Message Vanta").fill(instruction);
  await page.getByRole("button", { name: "Queue", exact: true }).click();
}

async function editFirst(page, instruction) {
  const first = page.locator(".queued-turn-list li").first();
  await first.getByRole("button", { name: "Edit queued turn" }).click();
  await first.getByLabel("Edit queued instruction").fill(instruction);
  await first.getByRole("button", { name: "Save" }).click();
  await first.getByText(instruction).waitFor();
}

async function expectFirst(page, instruction) {
  await page.waitForFunction((text) => document.querySelector(".queued-turn-list li strong")?.textContent === text, instruction);
}
