import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright-core";

const project = await mkdtemp(join(tmpdir(), "vanta-desktop-recovery-project-"));
const home = await mkdtemp(join(tmpdir(), "vanta-desktop-recovery-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-recovery-profile-"));
const executablePath = process.env.VANTA_DESKTOP_APP;
let app;
let attempts = 0;

try {
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", project] : ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      VANTA_HOME: home,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7828",
      VANTA_DESKTOP_AUTOMATION: "1",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "vanta-recovery-smoke-key",
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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          finalText: "Created docs/desktop-proof.md and preserved the partial result.",
          events: [{ label: "Wrote docs/desktop-proof.md", ok: true }],
          receipt: { status: "done", events: [{ label: "Wrote docs/desktop-proof.md", ok: true }], actions: [] },
        }),
      });
      return;
    }
    if (attempts === 2) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          finalText: "The verification step failed after the file was created.",
          events: [
            { label: "Wrote docs/desktop-proof.md", ok: true },
            { label: "Verification fixture failed", ok: false },
          ],
          receipt: {
            status: "failed",
            failureKind: "tool_error",
            events: [
              { label: "Wrote docs/desktop-proof.md", ok: true },
              { label: "Verification fixture failed", ok: false },
            ],
            actions: ["retry_failed_step", "edit_request", "start_from_checkpoint"],
            checkpoint: { instruction: message, partialText: "Created docs/desktop-proof.md." },
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        finalText: "Verification passed without repeating the completed write.",
        events: [{ label: "Verification passed", ok: true }],
        receipt: { status: "done", events: [{ label: "Verification passed", ok: true }], actions: [] },
      }),
    });
  });

  await page.locator(".app-shell").waitFor();
  const composer = page.getByPlaceholder("Ask Vanta to do something...");
  await composer.fill("Create and verify a desktop proof note");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("Created docs/desktop-proof.md and preserved the partial result.").waitFor();

  await composer.fill("Run a verification that can recover safely");
  await page.getByRole("button", { name: "Send" }).click();
  const recovery = page.locator(".run-recovery");
  await recovery.getByText("Run needs attention").waitFor();
  await recovery.getByText(/Partial output and timeline were saved/).waitFor();
  await recovery.getByRole("button", { name: "Edit request" }).click();
  assert.equal(await composer.inputValue(), "Run a verification that can recover safely");
  await recovery.getByRole("button", { name: "Start from checkpoint" }).click();
  assert.match(await composer.inputValue(), /Saved partial output:\nCreated docs\/desktop-proof\.md\./);
  await recovery.getByRole("button", { name: "Retry failed step" }).click();
  await page.getByText("Verification passed without repeating the completed write.").waitFor();
  await recovery.waitFor({ state: "detached" });
  assert.equal(attempts, 3);

  console.log(JSON.stringify({ coldStart: true, usefulTask: true, failedRun: true, partialOutput: true, editRequest: true, checkpoint: true, retry: true, attempts }));
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([
    rm(project, { recursive: true, force: true }),
    rm(home, { recursive: true, force: true }),
    rm(userData, { recursive: true, force: true }),
  ]);
}
