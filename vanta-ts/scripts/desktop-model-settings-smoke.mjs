import { _electron as electron } from "playwright-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const port = process.env.VANTA_DESKTOP_MODEL_SETTINGS_PORT ?? "7844";
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-model-settings-"));
const executablePath = process.env.VANTA_DESKTOP_APP;
const requests = [];
let active = {
  provider: "codex",
  model: "gpt-5.6-sol",
  modelSettings: { effortLevel: "high", speed: "standard" },
};
const providers = [
  {
    id: "codex", label: "OpenAI Codex via ChatGPT subscription", short: "Codex", models: ["gpt-5.6-sol", "gpt-5.6-terra"],
    current: true, savedDefaultModel: "gpt-5.6-sol", modelSource: "live", discoveryAvailable: true,
    modelSettings: {
      effort: { defaultValue: "medium", options: ["low", "medium", "high", "xhigh", "max", "ultra"] },
      speed: { defaultValue: "standard", options: ["standard", "fast"] },
    },
  },
  {
    id: "claude-code", label: "Claude Code", short: "Claude", models: ["claude-sonnet-5"],
    modelSource: "live", discoveryAvailable: true,
    modelSettings: { effort: { defaultValue: "medium", options: ["low", "medium", "high", "xhigh", "max"] } },
  },
  { id: "ollama", label: "Ollama", short: "Local", models: ["qwen2.5:14b"], modelSource: "catalog", discoveryAvailable: false, modelSettings: {} },
];

const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: executablePath ? ["--project", resolve(process.cwd(), "..")] : ["desktop-app/electron/main.mjs", "--project", resolve(process.cwd(), "..")],
  cwd: process.cwd(),
  env: {
    ...process.env,
    VANTA_DESKTOP_PORT: port,
    VANTA_DESKTOP_USER_DATA: userData,
    VANTA_DESKTOP_AUTOMATION: "1",
    OPENAI_API_KEY: "vanta-model-settings-smoke-key",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
  },
});

try {
  console.log("model settings smoke: Electron launched");
  const page = await app.firstWindow();
  page.setDefaultTimeout(10_000);
  await page.waitForURL((url) => url.protocol === "http:", { timeout: 20_000 });
  await installRoutes(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".app-shell").waitFor({ timeout: 20_000 });
  console.log("model settings smoke: fixtures loaded");

  await openPicker(page);
  const dialog = page.getByRole("dialog", { name: "Choose a model" });
  await dialog.getByLabel("OpenAI Codex via ChatGPT subscription effort").selectOption("ultra");
  await dialog.getByText("Applies to the next request.").waitFor();
  await dialog.getByLabel("OpenAI Codex via ChatGPT subscription speed").selectOption("fast");
  await dialog.getByText("1.5× speed, increased usage").waitFor();
  await dialog.getByText("Advanced", { exact: true }).click();
  await dialog.getByRole("button", { name: "Save as project defaults" }).click();
  await dialog.getByText("Saved as project defaults.").waitFor();
  await assertKeyboardReachable(dialog);
  const layout = await assertSettingsLayout(dialog);
  console.log("model settings smoke: Codex controls verified");
  await dialog.getByRole("button", { name: "Close model picker" }).click();

  active = { provider: "claude-code", model: "claude-sonnet-5", modelSettings: { effortLevel: "medium" } };
  await page.reload({ waitUntil: "domcontentloaded" });
  await openPicker(page);
  const claudeDialog = page.getByRole("dialog", { name: "Choose a model" });
  await claudeDialog.getByLabel("Claude Code effort").selectOption("xhigh");
  if (await claudeDialog.getByLabel("Claude Code speed").count()) throw new Error("Claude Code exposed an unsupported speed control");
  if (await claudeDialog.getByRole("option", { name: "Ultra" }).count()) throw new Error("Claude Code exposed unsupported Ultra effort");
  await claudeDialog.getByRole("tab", { name: /Local/ }).click();
  if (await claudeDialog.locator(".provider-setting").count()) throw new Error("Ollama exposed unsupported provider controls");

  const expected = [
    { effortLevel: "ultra", speed: "standard", scope: "session" },
    { effortLevel: "ultra", speed: "fast", scope: "session" },
    { effortLevel: "ultra", speed: "fast", scope: "global" },
    { effortLevel: "xhigh", scope: "session" },
  ];
  if (JSON.stringify(requests) !== JSON.stringify(expected)) throw new Error(`model settings payload mismatch: ${JSON.stringify(requests)}`);
  console.log("model settings smoke: Claude and unsupported controls verified");
  console.log(JSON.stringify({ ok: true, requests, codex: ["model", "effort", "speed"], claudeCode: ["model", "effort"], unsupportedHidden: true, keyboardReachable: true, layout }));
} finally {
  await app.close().catch(() => undefined);
  await rm(userData, { recursive: true, force: true });
}

async function installRoutes(page) {
  const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/status", (route) => json(route, { kernel: "online", ...active, tools: 8, sessionId: "model-settings-smoke", root: resolve(process.cwd(), ".."), goals: [], accessMode: "ask", accessScope: "project" }));
  await page.route("**/api/model-settings", async (route) => {
    const body = route.request().postDataJSON();
    const saved = { ...body };
    delete saved.scope;
    active.modelSettings = saved;
    requests.push(body);
    await json(route, { ...active, modelSettings: saved, scope: body.scope });
  });
  await page.route("**/api/models**", (route) => json(route, providers));
  for (const [path, body] of [["sessions", []], ["tools", []], ["files", []], ["canvas", null], ["capabilities", []], ["messaging", []], ["artifacts", []], ["runtime", { selectedHostId: "local", hosts: [] }], ["connect/google", { status: "needs_setup", clientConfigured: false, authorized: false, message: "Not configured" }]]) {
    await page.route(`**/api/${path}`, (route) => json(route, body));
  }
}

async function openPicker(page) {
  await page.locator(".composer").getByRole("button", { name: /Agent model: .* Change model/ }).click();
  await page.getByRole("dialog", { name: "Choose a model" }).waitFor();
}

async function assertKeyboardReachable(dialog) {
  const effort = dialog.getByLabel("OpenAI Codex via ChatGPT subscription effort");
  await effort.focus();
  await effort.press("Tab");
  const focused = await dialog.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  if (focused !== "OpenAI Codex via ChatGPT subscription speed") throw new Error(`speed control was not next in keyboard order: ${focused}`);
}

async function assertSettingsLayout(dialog) {
  const result = await dialog.evaluate((element) => {
    const panel = element.querySelector(".provider-settings");
    const detail = element.querySelector(".model-provider-detail");
    const selects = [...element.querySelectorAll(".provider-setting select")];
    if (!panel || !detail || selects.length !== 2) throw new Error("provider settings layout fixture is incomplete");
    const panelRect = panel.getBoundingClientRect();
    const detailRect = detail.getBoundingClientRect();
    return {
      insideDetail: panelRect.left >= detailRect.left && panelRect.right <= detailRect.right + 1,
      visible: panelRect.top >= detailRect.top && panelRect.bottom <= detailRect.bottom + 1,
      selectHeights: selects.map((select) => select.getBoundingClientRect().height),
      horizontalOverflow: element.scrollWidth - element.clientWidth,
    };
  });
  if (!result.insideDetail || !result.visible || result.horizontalOverflow > 1 || result.selectHeights.some((height) => height < 38)) throw new Error(`provider settings layout failed: ${JSON.stringify(result)}`);
  return result;
}
