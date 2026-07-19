import { _electron as electron } from "playwright-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const port = process.env.VANTA_DESKTOP_SMOKE_PORT ?? process.env.VANTA_DESKTOP_RUNTIME_SMOKE_PORT ?? "7823";
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-runtime-profile-"));
const executablePath = process.env.VANTA_DESKTOP_APP;
const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: executablePath ? ["--project", resolve(process.cwd(), "..")] : ["desktop-app/electron/main.mjs"],
  cwd: process.cwd(),
  env: {
    ...process.env,
    VANTA_DESKTOP_PORT: port,
    VANTA_DESKTOP_USER_DATA: userData,
    VANTA_DESKTOP_AUTOMATION: "1",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "vanta-desktop-runtime-smoke-key",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
  },
});

const local = runtimeHost({ id: "local", label: "Local Mac", kind: "local", engine: "llama_cpp", model: "qwen.gguf", kernel: "ready", status: "running", pressure: 38, throughput: 10, queue: 2 });
const remote = runtimeHost({ id: "remote-fixture", label: "Remote Fixture", kind: "remote", engine: "vllm", model: "qwen-remote", kernel: "not_ready", status: "degraded", pressure: 72, throughput: 18.4, queue: 1 });
let selectedHostId = "local";
let failStopOnce = true;
let selectedProfileId = "daily";
const runtimeUsage = { calls: 2, inputTokens: 40, outputTokens: 15, activeDurationMs: 4_000, requestLatencyMs: 700, failures: 1, missingTelemetryCalls: 1 };
const runtimeProfiles = [
  runtimeProfile({ id: "daily", name: "Daily local", model: "/models/qwen.gguf", bytes: 8 * 1024 ** 3, estimated: 9 * 1024 ** 3 }),
  runtimeProfile({ id: "fast", name: "Fast draft", model: "/models/qwen-fast.gguf", bytes: 4 * 1024 ** 3, estimated: 5 * 1024 ** 3 }),
];
let modelDownloads = [
  modelDownload({ id: "qwen-local", label: "Qwen local", status: "paused", downloaded: 40, bytes: 100, profileId: "daily", recovery: "Resume to continue from the persisted partial artifact." }),
  modelDownload({ id: "draft-local", label: "Draft local", status: "failed", downloaded: 25, bytes: 100, recovery: "Reconnect to the network, then resume from the partial artifact." }),
];

try {
  const page = await app.firstWindow();
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/sessions/draft", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ exists: false, value: "" }) });
  });
  await page.route("**/api/runtime", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      if (body.action === "stop" && failStopOnce) {
        failStopOnce = false;
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "fixture stop failed" }) });
        return;
      }
      if (body.action) applyAction(body.hostId, body.action);
      else selectedHostId = body.hostId;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ selectedHostId, hosts: [local, remote], usage: runtimeUsage }) });
  });
  await page.route("**/api/runtime/profiles", async (route) => {
    let exported;
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      if (body.action === "select") selectedProfileId = body.id;
      if (body.action === "clone") runtimeProfiles.push({ ...runtimeProfiles.find((item) => item.profile.id === body.id), profile: { ...runtimeProfiles.find((item) => item.profile.id === body.id).profile, id: body.newId, name: body.name } });
      if (body.action === "export") exported = JSON.stringify(runtimeProfiles.find((item) => item.profile.id === body.id)?.profile);
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ selectedId: selectedProfileId, host: { platform: "darwin", architecture: "arm64", memoryBytes: 24 * 1024 ** 3 }, profiles: runtimeProfiles, ...(exported ? { export: exported } : {}) }) });
  });
  await page.route("**/api/runtime/downloads", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const index = modelDownloads.findIndex((job) => job.id === body.id);
      if (body.action === "resume" && index >= 0) modelDownloads[index] = { ...modelDownloads[index], status: "completed", downloadedBytes: modelDownloads[index].source.bytes, completedAt: new Date().toISOString(), recovery: undefined };
      if (body.action === "retry" && index >= 0) modelDownloads[index] = { ...modelDownloads[index], status: "downloading", recovery: undefined };
      if (body.action === "pause" && index >= 0) modelDownloads[index] = { ...modelDownloads[index], status: "paused" };
      if (body.action === "cleanup" && index >= 0) modelDownloads[index] = { ...modelDownloads[index], status: "queued", downloadedBytes: 0, recovery: undefined };
      if (body.action === "enqueue") modelDownloads.push(modelDownload({ id: body.input.id, label: body.input.label, status: "queued", downloaded: 0, bytes: body.input.source.bytes, profileId: body.input.profileId }));
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jobs: modelDownloads, receipts: modelDownloads.map((job) => ({ version: 1, jobId: job.id, at: "2026-07-17T12:01:00.000Z", transition: job.status, downloadedBytes: job.downloadedBytes, destination: job.destination })) }) });
  });
  await page.locator(".app-shell").waitFor({ timeout: 20_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".app-shell").waitFor({ timeout: 20_000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".app-shell.theme-dark").waitFor({ timeout: 15_000 });
  await page.locator("[data-runtime-strip]").waitFor();
  await page.locator("[data-runtime-strip]").getByText("qwen.gguf").first().waitFor();
  await page.waitForFunction(() => {
    const composer = document.querySelector("#vanta-composer");
    return composer instanceof HTMLTextAreaElement && !composer.disabled;
  });

  const composer = page.getByPlaceholder("Ask Vanta to do something...");
  await composer.fill("Draft survives runtime switching");
  await assertDraft(composer, "after fill");
  const dark = await inspectRuntime(page, "dark");

  const trigger = page.locator(".runtime-strip-trigger");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Runtime details" });
  await dialog.waitFor();
  await assertDraft(composer, "after opening runtime details");
  const screenReader = await dialog.evaluate((element) => ({
    role: element.getAttribute("role"),
    label: element.getAttribute("aria-label"),
    modal: element.getAttribute("aria-modal"),
    switcher: element.querySelector('[role="group"][aria-label="Switch runtime host"]')?.getAttribute("aria-label"),
    pressed: [...element.querySelectorAll("button[aria-pressed]")].map((button) => button.getAttribute("aria-pressed")),
  }));
  if (screenReader.role !== "dialog" || screenReader.label !== "Runtime details" || screenReader.modal !== "false" || screenReader.switcher !== "Switch runtime host") {
    throw new Error(`runtime screen-reader contract is incomplete: ${JSON.stringify(screenReader)}`);
  }
  for (const text of ["Launch command", "llama-server", "Resource fit", "Benchmark", "Recorded usage", "40 in / 15 out", "1 call incomplete", "Recent lifecycle"]) {
    if (!await dialog.getByText(text, { exact: false }).count()) throw new Error(`runtime detail missing ${text}`);
  }
  const profilePanel = dialog.locator("details.runtime-profiles-panel");
  await profilePanel.locator(":scope > summary").click();
  await profilePanel.getByPlaceholder("Search profiles").fill("Fast");
  await profilePanel.getByRole("button", { name: /Fast draft/ }).click();
  await profilePanel.getByText("llama-server --model /models/qwen-fast.gguf").waitFor();
  await profilePanel.getByText("5.0 GB estimated").waitFor();
  await profilePanel.getByRole("button", { name: "Use profile" }).click();
  await profilePanel.getByText("Fast draft").first().waitFor();
  await profilePanel.getByPlaceholder("Search profiles").fill("");
  await profilePanel.getByRole("button", { name: /Daily local/ }).click();
  await profilePanel.getByRole("button", { name: "New" }).click();
  await profilePanel.getByLabel("Model path").waitFor();
  const advanced = profilePanel.locator("details").filter({ hasText: "Advanced controls" });
  if (await advanced.getAttribute("open") !== null) throw new Error("advanced runtime profile controls should start collapsed");
  await advanced.locator(":scope > summary").click();
  await profilePanel.getByLabel("Policy").waitFor();
  await profilePanel.getByLabel("Threads").waitFor();
  await profilePanel.getByLabel("Environment references").waitFor();
  await profilePanel.getByLabel("Unknown flags reviewed").waitFor();
  await profilePanel.getByRole("button", { name: "Cancel" }).click();
  await assertDraft(composer, "after runtime profile controls");
  const downloads = dialog.locator("details.model-downloads-panel");
  await downloads.locator(":scope > summary").click();
  await downloads.getByText("Qwen local").waitFor();
  await downloads.getByText("40%").waitFor();
  await downloads.getByText("profile daily", { exact: false }).waitFor();
  await downloads.getByRole("button", { name: "Resume" }).click();
  await downloads.getByText("completed", { exact: false }).waitFor();
  const failedDownload = downloads.locator("li").filter({ hasText: "Draft local" });
  await failedDownload.getByRole("button", { name: "Remove partial" }).click();
  await failedDownload.getByRole("button", { name: "Confirm remove" }).waitFor();
  await failedDownload.getByRole("button", { name: "Confirm remove" }).click();
  await failedDownload.getByText("queued", { exact: false }).waitFor();
  await downloads.getByRole("button", { name: "Add" }).click();
  await downloads.getByLabel("Hugging Face file URL").waitFor();
  const downloadAdvanced = downloads.locator("details").filter({ hasText: "Storage, auth, and profile" });
  if (await downloadAdvanced.getAttribute("open") !== null) throw new Error("advanced model download controls should start collapsed");
  await downloadAdvanced.locator(":scope > summary").click();
  await downloads.getByLabel("Auth reference").waitFor();
  await downloads.getByRole("button", { name: "Cancel" }).click();
  await assertDraft(composer, "after model download controls");
  const stop = dialog.getByRole("button", { name: "Stop" });
  await stop.click();
  await dialog.getByRole("alert").getByText("fixture stop failed").waitFor();
  await stop.click();
  const undo = dialog.getByRole("button", { name: "Undo stop" });
  await undo.waitFor();
  await undo.click();
  await dialog.getByRole("button", { name: "Stop" }).waitFor();
  await assertDraft(composer, "after runtime lifecycle actions");

  await dialog.getByRole("button", { name: /Remote Fixture/ }).click();
  await trigger.getByText("Remote Fixture").waitFor();
  await dialog.getByRole("button", { name: "Reconnect" }).click();
  await dialog.getByText("reconnected").waitFor();
  const draftAfterSwitch = await composer.inputValue();
  if (draftAfterSwitch !== "Draft survives runtime switching") throw new Error(`runtime host switch dropped the active draft: ${JSON.stringify(draftAfterSwitch)}`);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  if (!await trigger.evaluate((element) => element === document.activeElement)) throw new Error("runtime trigger did not regain focus after Escape");

  await page.evaluate(() => localStorage.setItem("vanta.desktop.theme", "light"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".app-shell.theme-light").waitFor();
  const light = await inspectRuntime(page, "light");

  await page.setViewportSize({ width: 1440, height: 900 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(2));
  await page.waitForTimeout(250);
  const zoom200 = await inspectRuntime(page, "light-zoom-200");
  if (zoom200.viewportWidth > 760) throw new Error(`200% zoom did not produce a compact layout viewport: ${JSON.stringify(zoom200)}`);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1));
  await page.waitForTimeout(250);

  const closeInspector = page.locator(".app-titlebar").getByRole("button", { name: "Close inspector" });
  if (await closeInspector.count()) await closeInspector.click();
  await page.setViewportSize({ width: 760, height: 900 });
  await page.waitForTimeout(250);
  const work = page.locator(".mobile-nav").getByRole("button", { name: "Work" });
  if (await work.count()) await work.click();
  const compact = await inspectRuntime(page, "light-compact");
  const compactTrigger = page.locator(".runtime-strip-trigger");
  await compactTrigger.click();
  const compactDialog = page.getByRole("dialog", { name: "Runtime details" });
  await compactDialog.waitFor();
  const compactOverlay = await compactDialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
  });
  if (compactOverlay.left < 0 || compactOverlay.right > compactOverlay.viewportWidth + 1 || compactOverlay.top < 0 || compactOverlay.bottom > compactOverlay.viewportHeight + 1) throw new Error(`compact runtime tray is outside the viewport: ${JSON.stringify(compactOverlay)}`);
  if (compactOverlay.bottom > compactOverlay.viewportHeight - 56) throw new Error(`compact runtime tray overlaps mobile navigation: ${JSON.stringify(compactOverlay)}`);
  if (compactOverlay.scrollWidth > compactOverlay.clientWidth + 1) throw new Error(`compact runtime tray scrolls horizontally: ${JSON.stringify(compactOverlay)}`);
  if (process.env.VANTA_DESKTOP_RUNTIME_SCREENSHOT) await page.screenshot({ path: process.env.VANTA_DESKTOP_RUNTIME_SCREENSHOT });

  console.log(JSON.stringify({ ok: true, dark, light, zoom200, compact, compactOverlay, screenReader, launch: true, stop: true, failure: true, reconnect: true, usage: { visible: true, calls: runtimeUsage.calls, missingExplicit: true }, profiles: { search: true, selected: selectedProfileId, evidence: true, progressiveDisclosure: true }, downloads: { progress: true, resume: true, cleanupConfirmation: true, profileLink: true, progressiveDisclosure: true }, draftPreserved: true, keyboardClose: true }));
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}

function runtimeHost(input) {
  return {
    host: { id: input.id, label: input.label, kind: input.kind },
    status: input.status,
    transport: "reachable",
    kernel: input.kernel,
    engine: { id: input.engine, lifecycle: input.status === "running" ? "running" : "idle", model: input.model },
    resources: { memoryUsedBytes: input.pressure, memoryTotalBytes: 100, utilizationPercent: input.pressure, throughputPerSecond: input.throughput },
    queueDepth: input.queue,
    observedAt: "2026-07-17T12:00:00.000Z",
    stale: false,
    detail: {
      controllerId: `${input.id}-controller`, requestOwner: "session:runtime-smoke", approval: input.kernel === "ready" ? "approved" : "not_required",
      command: { executable: input.engine === "llama_cpp" ? "llama-server" : "python3", args: ["--model", input.model], hash: "a".repeat(64) },
      resourceFit: { estimatedMemoryBytes: input.pressure, availableMemoryBytes: 100, headroomBytes: 100 - input.pressure, fits: true },
      benchmark: { latencyMs: 220, outputTokens: 5, providerLatencyMs: 130 },
      logs: [{ at: "2026-07-17T12:00:00.000Z", transition: input.status === "running" ? "running" : "degraded" }],
      actions: input.kind === "local" ? ["stop", "reconnect"] : ["reconnect"],
    },
  };
}

function runtimeProfile(input) {
  return {
    profile: {
      version: 2, id: input.id, name: input.name, backend: "llama_cpp", policyScope: "ask",
      model: { path: input.model, bytes: input.bytes }, resources: { contextTokens: 8192, availableMemoryBytes: 24 * 1024 ** 3 },
    },
    validation: { valid: true, compatible: true, issues: [] },
    preview: {
      command: "llama-server", args: ["--model", input.model, "--ctx-size", "8192"],
      resource: { estimatedMemoryBytes: input.estimated, availableMemoryBytes: 24 * 1024 ** 3, headroomBytes: 24 * 1024 ** 3 - input.estimated, fits: true },
    },
    roundTrip: true,
  };
}

function modelDownload(input) {
  return {
    version: 1, id: input.id, label: input.label,
    source: { kind: "hugging_face", url: `https://huggingface.co/vanta/${input.id}/resolve/main/model.gguf`, sha256: "a".repeat(64), bytes: input.bytes, filename: `${input.id}.gguf` },
    storageRoot: "/models", destination: `/models/${input.id}.gguf`, profileId: input.profileId,
    status: input.status, downloadedBytes: input.downloaded, resumedAt: 0, recovery: input.recovery,
    createdAt: "2026-07-17T12:00:00.000Z", updatedAt: "2026-07-17T12:01:00.000Z",
  };
}

function applyAction(hostId, action) {
  const host = hostId === "local" ? local : remote;
  if (action === "stop") {
    host.status = "idle"; host.engine.lifecycle = "idle"; host.detail.actions = ["launch", "reconnect"];
  } else if (action === "launch" || action === "retry") {
    host.status = "running"; host.engine.lifecycle = "running"; host.detail.actions = ["stop", "reconnect"];
  } else if (action === "reconnect") {
    host.transport = "reachable";
  }
  host.detail.logs.push({ at: new Date().toISOString(), transition: action === "reconnect" ? "reconnected" : action === "stop" ? "stopped" : "running" });
}

async function inspectRuntime(page, expectedTheme) {
  const strip = page.locator("[data-runtime-strip]");
  await strip.waitFor();
  const result = await strip.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const trigger = element.querySelector(".runtime-strip-trigger");
    const shell = document.querySelector(".app-shell");
    if (!trigger || !shell) throw new Error("Runtime strip fixture did not render");
    const style = getComputedStyle(trigger);
    return {
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      stripWidth: rect.width,
      stripHeight: rect.height,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      expanded: trigger.getAttribute("aria-expanded"),
      controls: trigger.getAttribute("aria-controls"),
      theme: shell.classList.contains("theme-light") ? "light" : "dark",
      color: style.color,
      background: style.backgroundColor,
    };
  });
  const expected = expectedTheme.startsWith("light") ? "light" : "dark";
  if (result.theme !== expected) throw new Error(`${expectedTheme}: expected ${expected} theme, got ${result.theme}`);
  if (result.documentScrollWidth > result.viewportWidth + 1) throw new Error(`${expectedTheme}: page scrolls horizontally`);
  if (result.scrollWidth > result.clientWidth + 1) throw new Error(`${expectedTheme}: runtime strip scrolls horizontally`);
  if (result.stripHeight < 33 || result.stripHeight > 36) throw new Error(`${expectedTheme}: runtime strip height is unstable: ${result.stripHeight}`);
  if (result.expanded !== "false" || result.controls !== "runtime-context-panel") throw new Error(`${expectedTheme}: runtime disclosure semantics are invalid`);
  if (!result.color || !result.background) throw new Error(`${expectedTheme}: runtime theme styles were not applied`);
  return result;
}

async function assertDraft(composer, checkpoint) {
  const value = await composer.inputValue();
  if (value !== "Draft survives runtime switching") throw new Error(`runtime draft changed ${checkpoint}: ${JSON.stringify(value)}`);
}
