import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright-core";

if (process.env.VANTA_DESKTOP_LIVE_PROOF !== "1") {
  throw new Error("Refusing provider use. Re-run with VANTA_DESKTOP_LIVE_PROOF=1.");
}

const home = await mkdtemp(join(tmpdir(), "vanta-desktop-live-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-live-profile-"));
const project = await mkdtemp(join(tmpdir(), "vanta-desktop-live-project-"));
const port = process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7834";
const executablePath = process.env.VANTA_DESKTOP_APP;
const started = Date.now();
const marker = `VANTA_DESKTOP_LIVE_READ_${randomUUID()}`;
let app;
const rendererErrors = [];
const serverErrors = [];

try {
  await writeFile(join(project, "README.md"), `${marker}\n`, "utf8");
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", project] : ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      VANTA_HOME: home,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: port,
      VANTA_DESKTOP_AUTOMATION: "1",
      VANTA_PROVIDER: process.env.VANTA_DESKTOP_LIVE_PROVIDER ?? "codex",
      VANTA_MODEL: process.env.VANTA_DESKTOP_LIVE_MODEL ?? "gpt-5.6-sol",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(150_000);
  page.on("pageerror", (error) => rendererErrors.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.includes("Failed to load resource: the server responded with a status of 500")) rendererErrors.push(`console error: ${text}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });

  await page.locator(".app-shell").waitFor();
  await page.locator("#vanta-composer").fill("Use read_file to read README.md. Reply with exactly the marker found in that file and nothing else.");
  await page.locator("#vanta-composer").press("Enter");
  const approval = await page.waitForFunction(async () => {
    const response = await fetch("/api/approval");
    return response.ok ? response.json() : null;
  }, undefined, { polling: 500, timeout: 15_000 }).then((handle) => handle.jsonValue()).catch(() => null);
  if (approval?.id) await page.evaluate(async (id) => {
    const response = await fetch("/api/approval", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, decision: "allow" }) });
    if (!response.ok) throw new Error(`approval failed (${response.status})`);
  }, approval.id);
  await page.locator(".message.assistant").filter({ hasText: marker }).last().waitFor();
  if (serverErrors.length) throw new Error(`Server errors: ${serverErrors.join(" | ")}`);
  if (rendererErrors.length) throw new Error(`Renderer errors: ${rendererErrors.join(" | ")}`);
  process.stdout.write(`${JSON.stringify({ desktopLiveTurn: true, readFile: true, approved: Boolean(approval?.id), provider: "local-codex", elapsedMs: Date.now() - started, rootIsolated: true })}\n`);
} finally {
  if (app) {
    const process = app.process();
    await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 3_000))]);
    if (process && !process.killed) process.kill("SIGKILL");
  }
  await Promise.all([rm(home, { recursive: true, force: true }), rm(userData, { recursive: true, force: true }), rm(project, { recursive: true, force: true })]);
}
