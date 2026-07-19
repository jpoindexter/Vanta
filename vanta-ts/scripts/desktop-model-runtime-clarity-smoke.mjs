import { _electron as electron } from "playwright-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const port = process.env.VANTA_DESKTOP_MODEL_RUNTIME_SMOKE_PORT ?? "7838";
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-model-runtime-"));
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
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "vanta-desktop-model-runtime-smoke-key",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
  },
});

let state = "mixed";
let releaseLoading;

try {
  const page = await app.firstWindow();
  if (process.env.DEBUG_MODEL_RUNTIME === "1") page.on("response", (response) => {
    if (response.url().includes("/api/")) console.error("response", response.status(), response.url());
  });
  if (process.env.DEBUG_MODEL_RUNTIME === "1") page.on("console", (message) => console.error("console", message.type(), message.text()));
  await page.route("**/api/status", async (route) => {
    if (process.env.DEBUG_MODEL_RUNTIME === "1") console.error("status route", state, route.request().url());
    if (state === "loading") await new Promise((resolvePromise) => { releaseLoading = resolvePromise; });
    if (state === "unavailable") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "provider status unavailable" }) });
      return;
    }
    const localOnly = state === "local-only";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kernel: "online",
        provider: localOnly ? "ollama" : "openai",
        model: localOnly ? "qwen.gguf" : "gpt-5.6-sol",
        tools: 8,
        sessionId: "model-runtime-clarity",
        root: resolve(process.cwd(), ".."),
        goals: [],
        accessMode: "ask",
        accessScope: "project",
      }),
    });
  });
  await page.route("**/api/runtime", async (route) => {
    if (process.env.DEBUG_MODEL_RUNTIME === "1") console.error("runtime route", state, route.request().url());
    const active = state === "mixed" || state === "local-only";
    const hosts = state === "loading" || state === "unavailable" ? [] : [runtimeHost(active)];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ selectedHostId: "local", hosts, usage: emptyUsage() }) });
  });
  for (const [path, body] of [
    ["sessions", []],
    ["tools", []],
    ["files", []],
    ["models", []],
    ["canvas", null],
    ["capabilities", []],
    ["messaging", []],
    ["artifacts", []],
    ["connect/google", { status: "needs_setup", clientConfigured: false, authorized: false, message: "Not configured" }],
  ]) {
    await page.route(`**/api/${path}`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
  }

  await page.locator(".app-shell").waitFor({ timeout: 20_000 });
  await page.getByPlaceholder("Ask Vanta to do something...").waitFor();
  await loadState(page, "mixed");
  const mixed = await assertReadyState(page, "openai · gpt-5.6-sol", "Local Mac · qwen.gguf");
  await assertExpandedState(page, "openai · gpt-5.6-sol", "Local Mac · qwen.gguf");

  await loadState(page, "remote-only");
  const remoteOnly = await assertReadyState(page, "openai · gpt-5.6-sol", "Local Mac · Inactive");
  await assertExpandedState(page, "openai · gpt-5.6-sol", "Local Mac · Inactive");

  await loadState(page, "local-only");
  const localOnly = await assertReadyState(page, "ollama · qwen.gguf", "Local Mac · qwen.gguf");

  state = "loading";
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Connecting to Vanta").waitFor();
  await page.locator("[data-runtime-strip]").getByText("Agent model", { exact: true }).waitFor();
  await page.locator("[data-runtime-strip]").getByText("Loading", { exact: true }).waitFor();
  await page.locator("[data-runtime-strip]").getByText("Local runtime", { exact: true }).waitFor();
  await page.locator("[data-runtime-strip]").getByText("Unavailable", { exact: true }).waitFor();
  const loading = true;
  state = "mixed";
  releaseLoading?.();
  await page.locator(".app-shell").waitFor();

  await loadState(page, "unavailable");
  await page.getByRole("alert").getByText("provider status unavailable").waitFor();
  await page.locator("[data-runtime-strip]").getByText("Agent model", { exact: true }).waitFor();
  await page.locator("[data-runtime-strip]").getByText("Unavailable", { exact: true }).first().waitFor();
  const unavailable = true;

  await loadState(page, "mixed");
  await page.setViewportSize({ width: 700, height: 850 });
  await page.getByRole("button", { name: "Agent model: gpt-5.6-sol. Change model" }).waitFor();
  const compact = await page.locator("[data-runtime-strip]").evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    text: element.textContent,
  }));
  if (compact.scrollWidth > compact.clientWidth + 1) throw new Error(`compact model/runtime strip scrolls horizontally: ${JSON.stringify(compact)}`);
  if (!compact.text?.includes("Agent model") || !compact.text.includes("Local runtime")) throw new Error(`compact model/runtime scope labels are missing: ${JSON.stringify(compact)}`);

  console.log(JSON.stringify({
    ok: true,
    source: !executablePath,
    packaged: Boolean(executablePath),
    states: { mixed, remoteOnly, localOnly, loading, unavailable },
    expanded: true,
    compact,
  }));
} finally {
  releaseLoading?.();
  await app.close();
  await rm(userData, { recursive: true, force: true });
}

async function loadState(page, next) {
  state = next;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".app-shell").waitFor();
  if (next !== "unavailable") await page.getByPlaceholder("Ask Vanta to do something...").waitFor();
}

async function assertReadyState(page, agent, local) {
  const strip = page.locator("[data-runtime-strip]");
  let observed = "";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    observed = await strip.textContent() ?? "";
    if (observed.includes(agent) && observed.includes(local)) break;
    await page.waitForTimeout(50);
  }
  if (!observed?.includes(agent) || !observed.includes(local)) throw new Error(`model/runtime state mismatch; expected ${agent} and ${local}, observed ${observed}`);
  await strip.getByText("Agent model", { exact: true }).waitFor();
  await strip.getByText(agent, { exact: true }).waitFor();
  await strip.getByText("Local runtime", { exact: true }).waitFor();
  await strip.getByText(local, { exact: true }).first().waitFor();
  const model = agent.split(" · ").at(-1);
  await page.getByRole("button", { name: `Agent model: ${model}. Change model` }).waitFor();
  await page.locator(".titlebar-runtime").getByRole("button", { name: `Agent model: ${agent}. Change model` }).waitFor();
  return true;
}

async function assertExpandedState(page, agent, local) {
  await page.locator(".runtime-strip-trigger").click();
  const dialog = page.getByRole("dialog", { name: "Runtime details" });
  await dialog.getByText("Agent model", { exact: true }).waitFor();
  await dialog.getByText(agent, { exact: true }).waitFor();
  await dialog.getByText("Local runtime", { exact: true }).first().waitFor();
  await dialog.getByText(local, { exact: true }).first().waitFor();
  await dialog.getByRole("button", { name: "Close runtime details" }).click();
}

function runtimeHost(active) {
  return {
    host: { id: "local", label: "Local Mac", kind: "local" },
    status: active ? "running" : "idle",
    transport: "reachable",
    kernel: "ready",
    engine: active ? { id: "llama_cpp", lifecycle: "running", model: "qwen.gguf" } : { lifecycle: "idle" },
    resources: active ? { utilizationPercent: 38, throughputPerSecond: 10 } : {},
    queueDepth: 0,
    observedAt: "2026-07-18T12:00:00.000Z",
    stale: false,
    detail: {
      controllerId: "local-controller",
      requestOwner: "session:model-runtime-clarity",
      approval: "not_required",
      logs: [],
      actions: ["reconnect"],
    },
  };
}

function emptyUsage() {
  return { calls: 0, inputTokens: 0, outputTokens: 0, activeDurationMs: 0, requestLatencyMs: 0, failures: 0, missingTelemetryCalls: 0 };
}
