import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";
import { scanAccessibility } from "./lib/desktop-accessibility-proof.mjs";

const project = await mkdtemp(join(tmpdir(), "vanta-continuity-project-"));
const vantaHome = await mkdtemp(join(tmpdir(), "vanta-continuity-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-continuity-profile-"));
const sourcePath = join(project, "brief.md");
const sourceText = "# Restart proof\n\n- [ ] Email Sam the revised outline\n- [ ] Archive old notes\n";
const basePort = Number(process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7858");
const rendererErrors = [];
const executablePath = process.env.VANTA_DESKTOP_APP;
let app;

function supportProfile(expiresAt) {
  return {
    support: {
      capacity: {
        cognitive: "unknown", attentional: "low", sensory: "unknown", social: "unknown",
        emotional: "unknown", physical: "unknown", time: "steady",
      },
      transient: { setAt: "2026-08-02T08:00:00.000Z", reviewAt: "2026-08-02T12:00:00.000Z", expiresAt },
      quietHours: { enabled: true, start: "22:00", end: "08:00" },
      interruptionBudget: { daily: 2 },
      interaction: { reducedMotion: true, streaming: false, autoScroll: false },
      refusals: { global: false, patterns: [] },
    },
  };
}

async function launch(index) {
  const next = await electron.launch({
    ...(executablePath ? { executablePath: resolve(executablePath) } : {}),
    args: executablePath ? ["--project", project] : ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: vantaHome,
      VANTA_HOME: vantaHome,
      VANTA_PROJECT_ROOT: project,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: String(basePort + index),
      VANTA_DESKTOP_AUTOMATION: "1",
      VANTA_PROVIDER: "openai",
      VANTA_MODEL: "gpt-4o-mini",
      OPENAI_API_KEY: "vanta-continuity-proof-key",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await next.firstWindow();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => rendererErrors.push(error.message));
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path === "/api/continuity" && response.status() >= 400) {
      rendererErrors.push(`continuity HTTP ${response.status()}`);
    }
  });
  await page.locator(".app-shell").waitFor();
  await page.locator(".desktop-nav").getByRole("button", { name: "Today", exact: true }).click();
  await page.locator(".continuity-workspace").getByRole("heading", { name: "Today", exact: true }).waitFor();
  return { app: next, page };
}

async function snapshot(page) {
  return page.evaluate(() => fetch("/api/continuity", {
    headers: { "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`continuity snapshot failed (${response.status})`);
    return response.json();
  }));
}

async function waitForReceiptCount(page, count) {
  await page.waitForFunction(async (expected) => {
    const response = await fetch("/api/continuity", {
      headers: { "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" },
    });
    if (!response.ok) return false;
    const value = await response.json();
    return value.receipts?.length === expected;
  }, count);
}

async function waitForReceiptAction(page, action) {
  await page.waitForFunction(async (expected) => {
    const response = await fetch("/api/continuity", {
      headers: { "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" },
    });
    if (!response.ok) return false;
    const value = await response.json();
    return value.receipts?.some((receipt) => receipt.action === expected);
  }, action);
}

async function closeCurrent() {
  await app?.close().catch(() => undefined);
  app = undefined;
}

try {
  await writeFile(sourcePath, sourceText, "utf8");
  await writeFile(join(vantaHome, "nd-profile.json"), JSON.stringify(supportProfile("2099-08-03T12:00:00.000Z"), null, 2), "utf8");

  let launched = await launch(0);
  app = launched.app;
  let page = launched.page;
  await page.getByText(/Quiet hours 22:00–08:00/).waitFor();
  await page.getByText(/streaming buffered · scroll manual/).waitFor();
  assert.equal((await snapshot(page)).support.capacity.attentional, "low");
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  await page.getByRole("region", { name: "Read-only source reconciliation" }).waitFor();
  await page.getByText(/read-only/).first().waitFor();
  await page.getByRole("tab", { name: "Today", exact: true }).click();
  await page.getByLabel("What do you want off your mind?").fill("I lost the thread in @brief.md and need one next step");
  await page.getByRole("button", { name: "Capture", exact: true }).click();
  const card = page.locator(".recommendation-card");
  await card.getByText("I lost the thread in @brief.md and need one next step", { exact: true }).waitFor();
  await page.getByLabel("Attentional: low").waitFor();
  assert.equal(await card.count(), 1, "Today rendered more than one recommendation");
  const accessibility = await scanAccessibility(page, "continuity Today");
  await card.getByRole("button", { name: "Show me", exact: true }).click();
  assert.deepEqual((await snapshot(page)).receipts, [], "preview created an execution receipt");
  assert.equal(await readFile(sourcePath, "utf8"), sourceText, "preview changed the project source");

  await card.getByRole("button", { name: "Do it", exact: true }).click();
  await page.getByText("Pick up here", { exact: true }).waitFor();
  await page.getByText("Email Sam the revised outline", { exact: true }).first().waitFor();
  const first = await snapshot(page);
  assert.equal(first.runs.length, 1);
  assert.equal(first.approvals.length, 1);
  assert.equal(first.receipts.length, 1);
  assert.deepEqual(first.receipts[0], {
    version: 1,
    id: `${first.today[0].id}:prepared-read:receipt`,
    workItemId: first.today[0].id,
    runId: `${first.today[0].id}:prepared-read`,
    action: "continuity.read_local_source",
    disposition: "confirmed",
    verification: "verified",
    evidence: first.receipts[0].evidence,
    at: first.receipts[0].at,
  });
  assert.match(first.receipts[0].evidence, /^sha256:[a-f0-9]{64}$/);
  assert.equal(await readFile(sourcePath, "utf8"), sourceText, "prepared read changed the project source");
  if (process.env.VANTA_CONTINUITY_SCREENSHOT) {
    await page.screenshot({ path: process.env.VANTA_CONTINUITY_SCREENSHOT, fullPage: false });
  }
  await closeCurrent();

  await writeFile(join(vantaHome, "nd-profile.json"), JSON.stringify(supportProfile("2000-08-03T12:00:00.000Z"), null, 2), "utf8");
  launched = await launch(1);
  app = launched.app;
  page = launched.page;
  await page.getByText("Pick up here", { exact: true }).waitFor();
  await page.getByLabel("Attentional: unknown").waitFor();
  await page.locator(".recommendation-card").getByRole("button", { name: "Do it", exact: true }).click();
  await waitForReceiptCount(page, 1);
  const replay = await snapshot(page);
  assert.equal(replay.runs.length, 1, "restart replay duplicated the run");
  assert.equal(replay.receipts.length, 1, "restart replay duplicated the receipt");

  await page.getByLabel("Off scope").selectOption("session");
  await page.getByRole("button", { name: "Off", exact: true }).click();
  await page.getByText("Nothing is asking for attention", { exact: true }).waitFor();
  assert.deepEqual((await snapshot(page)).support.refusal, { active: true, scope: "session" });
  await closeCurrent();

  launched = await launch(2);
  app = launched.app;
  page = launched.page;
  await page.getByText("Pick up here", { exact: true }).waitFor();
  const resumed = await snapshot(page);
  assert.deepEqual(resumed.support.refusal, { active: false });
  assert.equal(resumed.receipts.length, 1, "pre-snooze restart had an unexpected receipt");
  await page.locator(".recommendation-card").getByRole("button", { name: "Snooze", exact: true }).click();
  await waitForReceiptAction(page, "continuity.snooze");
  const snoozed = await snapshot(page);
  assert.equal(snoozed.today[0].state, "waiting");
  const snoozeReceipt = snoozed.receipts.find((receipt) => receipt.action === "continuity.snooze");
  assert.match(snoozed.today[0].followUp.at ?? "", /^\d{4}-\d{2}-\d{2}T/, `missing snooze time: ${JSON.stringify({ followUp: snoozed.today[0].followUp, receipt: snoozeReceipt })}`);
  await page.locator(".recommendation-card").getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByText("Nothing is asking for attention", { exact: true }).waitFor();
  const skipped = await snapshot(page);
  assert.equal(skipped.receipts.length, 3);
  assert.equal(skipped.receipts.at(-1).disposition, "denied");
  assert.equal(skipped.inbox.length, 0);
  assert.equal(await readFile(sourcePath, "utf8"), sourceText, "continuity actions changed the project source");
  assert.deepEqual(rendererErrors, []);

  console.log(JSON.stringify({
    electronLaunches: 3,
    capturedProjectFile: "brief.md",
    recommendationsShown: 1,
    processRestartReentry: true,
    exactlyOncePreparedRead: true,
    transientCapacityExpiredToUnknown: true,
    sessionRefusalResetOnRestart: true,
    snoozeAndSkipSettled: true,
    sourceUnchanged: true,
    accessibility,
    runs: skipped.runs.length,
    approvals: skipped.approvals.length,
    receipts: skipped.receipts.length,
    legacySources: skipped.legacy.sources.length,
    sourceReconciliationVisible: true,
    target: executablePath ? "packaged" : "source",
  }));
} finally {
  await closeCurrent();
  await Promise.all([
    rm(project, { recursive: true, force: true }),
    rm(vantaHome, { recursive: true, force: true }),
    rm(userData, { recursive: true, force: true }),
  ]);
}
