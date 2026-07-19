import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright-core";

const project = await mkdtemp(join(tmpdir(), "vanta-provider-auth-project-"));
const home = await mkdtemp(join(tmpdir(), "vanta-provider-auth-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-provider-auth-profile-"));
const executablePath = process.env.VANTA_DESKTOP_APP;
let app;
let chatCalls = 0;
let setupCalls = 0;

try {
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", project] : ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: home,
      VANTA_HOME: home,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7836",
      VANTA_DESKTOP_AUTOMATION: "1",
      VANTA_PROVIDER: "openai",
      VANTA_MODEL: "gpt-5.6-sol",
      OPENAI_API_KEY: "vanta-provider-auth-smoke-key",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(30_000);
  await page.route(/\/api\/chat$/, async (route) => {
    chatCalls += 1;
    const message = route.request().postDataJSON().message;
    const failed = chatCalls === 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(failed ? {
        finalText: "Provider authentication required for openai · gpt-5.6-sol. Reconnect this model in Connect before retrying.",
        events: [{ label: "Provider authentication required.", ok: false }],
        receipt: {
          status: "failed",
          failureKind: "provider_auth",
          events: [{ label: "Provider authentication required.", ok: false }],
          actions: ["edit_request", "start_from_checkpoint"],
          checkpoint: { instruction: message },
        },
      } : {
        finalText: "Email check resumed after verified authentication.",
        events: [],
        receipt: { status: "done", events: [], actions: [] },
      }),
    });
  });
  await page.route(/\/api\/setup$/, async (route) => {
    setupCalls += 1;
    const failed = setupCalls === 1;
    await route.fulfill({
      status: failed ? 400 : 200,
      contentType: "application/json",
      body: JSON.stringify(failed ? { error: "Could not verify Codex subscription login: authentication required" } : { ok: true, provider: "codex", model: "gpt-5.6-sol" }),
    });
  });

  await page.locator(".app-shell").waitFor();
  const composer = page.getByPlaceholder("Ask Vanta to do something...");
  await composer.fill("check my email");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const recovery = page.locator(".run-recovery");
  await recovery.getByText("Provider authentication required", { exact: true }).waitFor();
  assert.equal(await recovery.getByRole("button", { name: "Retry failed step" }).count(), 0);
  await recovery.getByRole("button", { name: "Reconnect model" }).click();

  const dialog = page.getByRole("dialog", { name: "Connect a model" });
  await dialog.waitFor();
  await dialog.locator("select").selectOption("codex");
  await dialog.getByRole("button", { name: "Connect", exact: true }).click();
  await dialog.getByRole("alert").getByText(/Could not verify Codex subscription login/).waitFor();
  assert.equal(chatCalls, 1, "a failed credential probe must not resume the request");

  await dialog.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByText("Email check resumed after verified authentication.").waitFor();
  assert.equal(chatCalls, 2, "successful reauthentication should resume exactly once");
  assert.equal(setupCalls, 2);

  console.log(JSON.stringify({ packaged: Boolean(executablePath), providerAuthRecovery: true, rejectedProbeDidNotResume: true, verifiedProbeResumed: true, chatCalls, setupCalls }));
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([rm(project, { recursive: true, force: true }), rm(home, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })]);
}
