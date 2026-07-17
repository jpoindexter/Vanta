import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright-core";

const project = await mkdtemp(join(tmpdir(), "vanta-desktop-schema-project-"));
const home = await mkdtemp(join(tmpdir(), "vanta-desktop-schema-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-schema-profile-"));
const executablePath = process.env.VANTA_DESKTOP_APP;
let app;
let attempts = 0;

const mismatchTrace = {
  planId: "plan-settings",
  runId: "run-settings-7",
  queue: { status: "stopped", reason: "Prediction mismatch at $.dialog.open; 2 remaining actions discarded." },
  certification: { certified: false, modelVersion: 4, coverage: "Certification invalidated by counterexample" },
  transitions: [
    {
      id: "run-settings-7:1", sequence: 1, label: "Open settings", actionMode: "simulated", status: "match",
      modelVersion: 4, predicted: "settings open", observed: "settings open",
      backtest: { certified: true, matchedTransitions: 11, totalTransitions: 12, timelineHash: "sha256:before-revision" },
    },
    {
      id: "run-settings-7:2", sequence: 2, label: "Prediction mismatch", actionMode: "real", status: "mismatch",
      modelVersion: 4, path: "$.dialog.open", predicted: "true", observed: "false",
    },
  ],
};

const revisedTrace = {
  planId: "plan-settings",
  runId: "run-settings-8",
  queue: { status: "resumed", reason: "Model v5 recertified; the discarded queue is ready to resume from its checkpoint." },
  certification: { certified: true, modelVersion: 5, coverage: "13/13 complete-history transitions" },
  transitions: [{
    id: "run-settings-8:2", sequence: 2, label: "Recovered transition", actionMode: "real", status: "revised",
    modelVersion: 5, path: "$.dialog.open", predicted: "false", observed: "false",
    modelDiff: { fromVersion: 4, toVersion: 5, summary: ["Guard dialog state before advancing", "Retain mismatch as a counterexample fixture"] },
    backtest: { certified: true, matchedTransitions: 13, totalTransitions: 13, timelineHash: "sha256:after-revision" },
  }],
};

try {
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", project] : ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      VANTA_HOME: home,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7837",
      VANTA_DESKTOP_AUTOMATION: "1",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "vanta-schema-smoke-key",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(30_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.route(/\/api\/chat$/, async (route) => {
    attempts += 1;
    const message = route.request().postDataJSON().message;
    if (attempts === 1) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        finalText: "The real action diverged from the certified model, so the queue stopped.",
        events: [{ label: "Model diverged at $.dialog.open", ok: false }],
        receipt: {
          status: "failed", failureKind: "model_mismatch",
          events: [{ label: "Model diverged at $.dialog.open", ok: false }],
          actions: ["edit_request", "start_from_checkpoint"],
          checkpoint: { instruction: message }, schemaTrace: mismatchTrace,
        },
      }) });
      return;
    }
    if (attempts === 2) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        finalText: "Model v5 passed complete-history backtest and the queue can resume.",
        events: [{ label: "Model v5 recertified", ok: true }],
        receipt: {
          status: "failed", failureKind: "model_mismatch",
          events: [{ label: "Model v5 recertified", ok: true }],
          actions: ["retry_failed_step", "edit_request", "start_from_checkpoint"],
          checkpoint: { instruction: message }, schemaTrace: revisedTrace,
        },
      }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      finalText: "The recertified queue resumed and completed.",
      events: [{ label: "Resumed from recertified checkpoint", ok: true }],
      receipt: { status: "done", events: [{ label: "Resumed from recertified checkpoint", ok: true }], actions: [] },
    }) });
  });

  await page.locator(".app-shell").waitFor();
  const composer = page.getByPlaceholder("Ask Vanta to do something...");
  await composer.fill("Run the settings workflow");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("The real action diverged from the certified model, so the queue stopped.").waitFor();

  const recovery = page.locator(".run-recovery");
  const trace = recovery.locator(".schema-trace-explorer");
  assert.equal(await trace.getAttribute("open"), null, "trace should remain optional until opened");
  const traceSummary = trace.locator(":scope > summary");
  await traceSummary.focus();
  await traceSummary.press("Enter");
  assert.notEqual(await trace.getAttribute("open"), null, "keyboard should open trace explorer");
  await trace.getByText("Prediction mismatch at $.dialog.open; 2 remaining actions discarded.").waitFor();

  const transitions = trace.locator(".schema-transition");
  assert.equal(await transitions.count(), 2);
  for (let index = 0; index < 2; index += 1) {
    const summary = transitions.nth(index).locator(":scope > summary");
    await summary.focus();
    await summary.press("Enter");
    assert.notEqual(await transitions.nth(index).getAttribute("open"), null);
  }
  await trace.getByText("simulated · match").waitFor();
  await trace.getByText("real · mismatch").waitFor();
  await trace.getByText("settings open", { exact: true }).first().waitFor();
  await trace.getByText("$.dialog.open", { exact: true }).waitFor();
  await trace.getByRole("heading", { name: "Backtest receipt" }).waitFor();
  assert.equal(await recovery.getByRole("button", { name: "Retry failed step" }).isDisabled(), true);

  await page.setViewportSize({ width: 760, height: 700 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `compact trace should not overflow horizontally (${overflow}px)`);

  await composer.fill("Revise the model and recertify complete history");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("Model v5 passed complete-history backtest and the queue can resume.").waitFor();
  const revisedRecovery = page.locator(".run-recovery");
  const revisedExplorer = revisedRecovery.locator(".schema-trace-explorer");
  await revisedExplorer.locator(":scope > summary").click();
  await revisedExplorer.locator(".schema-transition > summary").click();
  await revisedExplorer.getByText("Model diff · v4 → v5").waitFor();
  await revisedExplorer.getByText("Guard dialog state before advancing").waitFor();
  await revisedExplorer.getByText("13/13 transitions matched").waitFor();
  const retry = revisedRecovery.getByRole("button", { name: "Retry failed step" });
  assert.equal(await retry.isEnabled(), true);
  await retry.click();
  await page.getByText("The recertified queue resumed and completed.").waitFor();
  await revisedRecovery.waitFor({ state: "detached" });
  assert.equal(attempts, 3);

  console.log(JSON.stringify({ optional: true, keyboard: true, match: true, mismatch: true, simulatedVsReal: true, stopReason: true, modelDiff: true, backtest: true, recertificationGate: true, resumed: true, compact760: true, attempts }));
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([
    rm(project, { recursive: true, force: true }),
    rm(home, { recursive: true, force: true }),
    rm(userData, { recursive: true, force: true }),
  ]);
}
