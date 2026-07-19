import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright-core";

const home = await mkdtemp(join(tmpdir(), "vanta-google-connect-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-google-connect-profile-"));
const project = await mkdtemp(join(tmpdir(), "vanta-google-connect-project-"));
const executablePath = process.env.VANTA_DESKTOP_APP;
const port = String(7900 + (process.pid % 500));
const clientPath = join(project, "client_secret.json");
let app;

try {
  await mkdir(join(project, "docs"), { recursive: true });
  await writeFile(join(project, "README.md"), "Google Connect fixture", "utf8");
  await writeFile(clientPath, JSON.stringify({ installed: {
    client_id: "desktop-google-smoke-client",
    client_secret: "desktop-google-smoke-secret",
  } }), "utf8");

  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", project] : ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: home,
      VANTA_HOME: home,
      VANTA_PROJECT_ROOT: project,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: port,
      VANTA_DESKTOP_AUTOMATION: "1",
      VANTA_PROVIDER: "openai",
      VANTA_MODEL: "gpt-4o-mini",
      OPENAI_API_KEY: "vanta-google-connect-smoke-key",
      VANTA_KEYCHAIN: "0",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await app.firstWindow();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.setDefaultTimeout(30_000);
  await page.locator(".app-shell").waitFor();
  const invalidCredential = await page.evaluate(async () => {
    const boundary = window.vantaDesktop?.boundaryToken ?? "";
    const response = await fetch("/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vanta-desktop-boundary": boundary },
      body: JSON.stringify({ provider: "openai", model: "gpt-5.6-sol", apiKey: "sk-secret" }),
    });
    return { status: response.status, body: await response.text() };
  });
  if (invalidCredential.status !== 400 || !invalidCredential.body.includes("looks like a placeholder") || invalidCredential.body.includes("sk-secret")) {
    throw new Error(`Placeholder credential boundary failed: ${JSON.stringify(invalidCredential)}`);
  }
  const projectEnv = await readFile(join(project, ".vanta", ".env"), "utf8").catch(() => "");
  if (projectEnv.includes("sk-secret")) throw new Error("Placeholder credential reached project configuration");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("tab", { name: "Google", exact: true }).click();
  await page.getByRole("heading", { name: "Google Workspace" }).waitFor();
  await page.getByLabel("Downloaded client JSON path").fill(clientPath);
  await page.getByRole("button", { name: "Save client file" }).click();
  await page.getByText("Client saved. Complete Google consent to use Gmail, Calendar, and Drive.").waitFor();
  await page.getByRole("button", { name: "Start Google consent" }).waitFor();

  const storedPath = join(home, "google-client.json");
  const stored = JSON.parse(await readFile(storedPath, "utf8"));
  if (stored.clientId !== "desktop-google-smoke-client" || stored.clientSecret !== "desktop-google-smoke-secret") {
    throw new Error("Stored Google client did not match the ingested Desktop app client");
  }
  const mode = (await stat(storedPath)).mode & 0o777;
  if (mode !== 0o600) throw new Error(`Google client mode was ${mode.toString(8)}, expected 600`);

  await rm(clientPath);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".app-shell").waitFor();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("tab", { name: "Google", exact: true }).click();
  await page.getByRole("button", { name: "Start Google consent" }).waitFor();
  if (await page.getByLabel("Downloaded client JSON path").count()) {
    throw new Error("Google client setup returned after the original download was removed");
  }
  const status = await page.evaluate(() => fetch("/api/connect/google", { headers: { "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" } }).then((response) => response.json()));
  if (!status.clientConfigured || status.authorized) throw new Error(`Unexpected Google status: ${JSON.stringify(status)}`);
  if (pageErrors.length) throw new Error(`Renderer errors: ${pageErrors.join(" | ")}`);

  process.stdout.write(`${JSON.stringify({ source: !executablePath, packaged: !!executablePath, invalidCredentialRejected: true, clientIngested: true, sourceRemoved: true, restartPersistence: true, privateMode: mode.toString(8), consentReady: true })}\n`);
} finally {
  if (app) {
    const child = app.process();
    await Promise.race([app.close(), new Promise((resolveClose) => setTimeout(resolveClose, 3_000))]);
    if (child && !child.killed) child.kill("SIGKILL");
  }
  await Promise.all([
    rm(home, { recursive: true, force: true }),
    rm(userData, { recursive: true, force: true }),
    rm(project, { recursive: true, force: true }),
  ]);
}
