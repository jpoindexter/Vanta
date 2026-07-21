import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";
import { assertLiveProof, writeDiagnosticBundle } from "./lib/desktop-live-proof-diagnostics.mjs";

if (process.env.VANTA_DESKTOP_LIVE_PROOF !== "1") {
  throw new Error("Refusing provider use. Re-run with VANTA_DESKTOP_LIVE_PROOF=1.");
}

const home = await mkdtemp(join(tmpdir(), "vanta-desktop-live-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-live-profile-"));
const project = await mkdtemp(join(tmpdir(), "vanta-desktop-live-project-"));
const artifactRoot = resolve(process.env.VANTA_DESKTOP_LIVE_PROOF_ARTIFACTS ?? ".artifacts/desktop-live-proof");
const port = process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7834";
const executablePath = process.env.VANTA_DESKTOP_APP;
const started = Date.now();
const marker = `VANTA_DESKTOP_LIVE_READ_${randomUUID()}`;
const expectedText = process.env.VANTA_DESKTOP_LIVE_EXPECTED ?? marker;
const prompt = process.env.VANTA_DESKTOP_LIVE_PROMPT
  ?? "Use read_file to read README.md. Reply with exactly the marker found in that file and nothing else.";
let app;
let page;
let rawResponse;
let approvalState;
let initialStatus;
let resolveChatResponse;
const chatResponsePromise = new Promise((resolveResponse) => { resolveChatResponse = resolveResponse; });
const rendererErrors = [];
const clientErrors = [];
const serverErrors = [];
const startupLogs = [];

try {
  await mkdir(artifactRoot, { recursive: true });
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
  const child = app.process();
  child?.stdout?.on("data", (chunk) => startupLogs.push(`stdout: ${chunk.toString().trim()}`));
  child?.stderr?.on("data", (chunk) => startupLogs.push(`stderr: ${chunk.toString().trim()}`));
  page = await app.firstWindow();
  page.setDefaultTimeout(150_000);
  page.on("pageerror", (error) => rendererErrors.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    const genericHttpError = text.includes("Failed to load resource: the server responded with a status of 400")
      || text.includes("Failed to load resource: the server responded with a status of 500");
    if (message.type() === "error" && !genericHttpError) rendererErrors.push(`console error: ${text}`);
  });
  page.on("response", async (response) => {
    const path = new URL(response.url()).pathname;
    if (response.status() === 400) clientErrors.push(`400 ${path}`);
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${path}`);
    if (path === "/api/chat" && response.request().method() === "POST") {
      rawResponse = await response.json().catch(() => ({ parseError: true }));
      resolveChatResponse?.(rawResponse);
    }
  });

  await page.locator(".app-shell").waitFor();
  initialStatus = await fetchJson(page, "/api/status");
  await page.locator("#vanta-composer").fill(prompt);
  await page.locator("#vanta-composer").press("Enter");
  approvalState = await page.waitForFunction(async () => {
    const response = await fetch("/api/approval", { headers: { "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" } });
    return response.ok ? response.json() : null;
  }, undefined, { polling: 500, timeout: 15_000 }).then((handle) => handle.jsonValue()).catch(() => null);
  if (approvalState?.id) await page.evaluate(async (id) => {
    const response = await fetch("/api/approval", { method: "POST", headers: { "content-type": "application/json", "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" }, body: JSON.stringify({ id, decision: "allow" }) });
    if (!response.ok) throw new Error(`approval failed (${response.status})`);
  }, approvalState.id);
  await chatResponsePromise;
  await page.waitForFunction(() => document.querySelectorAll(".message.assistant").length > 0);
  const persistedSession = await waitForPersistedSession(home, expectedText);
  const assistant = page.locator(".message.assistant").filter({ hasText: expectedText }).last();
  const renderedText = await assistant.innerText();
  await page.locator(".thinking").waitFor({ state: "detached", timeout: 10_000 });
  const finalStatus = await fetchJson(page, "/api/status");
  const evidence = {
    rawResponse,
    persistedSession,
    renderedText,
    status: finalStatus,
    initialStatus,
    projectRoot: project,
    approvalState,
    startupLogs,
    rendererErrors,
    clientErrors,
    serverErrors,
  };
  assertLiveProof(evidence, expectedText);
  if (serverErrors.length) throw new Error(`Server errors: ${serverErrors.join(" | ")}`);
  if (clientErrors.length) throw new Error(`Client errors: ${clientErrors.join(" | ")}`);
  if (rendererErrors.length) throw new Error(`Renderer errors: ${rendererErrors.join(" | ")}`);

  const mutatedRenderedText = await assistant.evaluate((element) => {
    element.textContent = "DELIBERATE_RENDER_MUTATION";
    return element.textContent ?? "";
  });
  const mutatedEvidence = { ...evidence, renderedText: mutatedRenderedText };
  let mutationBundle;
  try {
    assertLiveProof(mutatedEvidence, expectedText);
    throw new Error("Deliberate render mutation was not detected");
  } catch (error) {
    if (!String(error).includes("rendered DOM does not contain marker")) throw error;
    mutationBundle = await writeDiagnosticBundle({
      artifactRoot,
      label: "deliberate-render-mutation",
      evidence: mutatedEvidence,
      error,
      screenshot: (path) => page.screenshot({ path, fullPage: false }),
    });
  }

  process.stdout.write(`${JSON.stringify({
    desktopLiveTurn: true,
    packaged: Boolean(executablePath),
    rawResponse: true,
    persistedSession: true,
    renderedDom: true,
    thinkingCleared: true,
    provider: finalStatus.provider,
    model: finalStatus.model,
    projectRoot: finalStatus.root,
    approvalState: approvalState?.id ? "approved" : "not_required",
    startupLogs: true,
    mutationRejected: true,
    mutationBundle: mutationBundle.bundlePath,
    elapsedMs: Date.now() - started,
  })}\n`);
} catch (error) {
  if (page) {
    const failureEvidence = {
      rawResponse,
      persistedSession: await findPersistedSession(home, expectedText),
      renderedText: await page.locator("body").innerText().catch(() => ""),
      status: await fetchJson(page, "/api/status").catch(() => null),
      initialStatus,
      projectRoot: project,
      approvalState,
      startupLogs,
      rendererErrors,
      clientErrors,
      serverErrors,
    };
    const bundle = await writeDiagnosticBundle({
      artifactRoot,
      label: `failure-${Date.now()}`,
      evidence: failureEvidence,
      error,
      screenshot: (path) => page.screenshot({ path, fullPage: false }),
    });
    error.message = `${error.message}\nDiagnostic bundle: ${bundle.bundlePath}\nScreenshot: ${bundle.screenshotPath}`;
  }
  throw error;
} finally {
  if (app) {
    const child = app.process();
    await Promise.race([app.close(), new Promise((resolveClose) => setTimeout(resolveClose, 3_000))]);
    if (child && !child.killed) child.kill("SIGKILL");
  }
  await Promise.all([rm(home, { recursive: true, force: true }), rm(userData, { recursive: true, force: true }), rm(project, { recursive: true, force: true })]);
}

async function fetchJson(targetPage, path) {
  return targetPage.evaluate(async (targetPath) => {
    const response = await fetch(targetPath, {
      headers: { "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" },
    });
    if (!response.ok) throw new Error(`${targetPath} failed (${response.status})`);
    return response.json();
  }, path);
}

async function waitForPersistedSession(root, targetMarker) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const session = await findPersistedSession(root, targetMarker);
    if (session) return session;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  return null;
}

async function findPersistedSession(root, targetMarker) {
  const sessionsDirectory = join(root, "sessions");
  const files = await readdir(sessionsDirectory).catch(() => []);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const session = JSON.parse(await readFile(join(sessionsDirectory, file), "utf8"));
    if (JSON.stringify(session).includes(targetMarker)) return session;
  }
  return null;
}
