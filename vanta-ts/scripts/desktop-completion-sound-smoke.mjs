import { _electron as electron } from "playwright-core";

const port = process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7816";
console.log("desktop sound smoke: launching Electron");
const app = await withTimeout(electron.launch({
  args: ["desktop-app/electron/main.mjs"],
  cwd: process.cwd(),
  env: { ...process.env, VANTA_DESKTOP_PORT: port, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
}), 15_000, "Electron launch");
console.log("desktop sound smoke: Electron connected");
let page;
let previousPreference = null;

try {
  page = await withTimeout(app.firstWindow(), 15_000, "first window");
  console.log("desktop sound smoke: first window ready");
  previousPreference = await page.evaluate(() => localStorage.getItem("vanta.desktop.completion-sound.v1"));
  if (process.env.VANTA_DESKTOP_SMOKE_CLEAN === "1") previousPreference = null;
  page.setDefaultTimeout(7_000);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const bodies = {
      "/api/status": { kernel: "online", model: "test-model", tools: 3, sessionId: "smoke", goals: [] },
      "/api/sessions": [],
      "/api/tools": [],
      "/api/files": [],
      "/api/models": [],
      "/api/approval": null,
      "/api/chat": { finalText: "Desktop turn finished", events: [{ label: "done", ok: true }] },
    };
    const body = Object.hasOwn(bodies, path) ? bodies[path] : {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.evaluate(instrumentAudioContext);
  console.log("desktop sound smoke: fixture APIs installed");

  const soundButton = page.getByRole("button", { name: "Completion sound settings" });
  await soundButton.click();
  const enabled = page.getByLabel("Play after each completed turn");
  if (!await enabled.isChecked()) await enabled.check();
  await page.getByLabel("Chime").selectOption("soft");
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByPlaceholder("Message Vanta. Use @ for files or / for commands.").fill("finish this turn");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("Desktop turn finished").waitFor();
  const softStarts = await audioStartCount(page);
  assert(softStarts === 2, `expected 2 soft oscillators, got ${softStarts}`);
  console.log("desktop sound smoke: turn-complete cue scheduled");

  await page.getByRole("button", { name: "Completion sound settings" }).click();
  await page.getByLabel("Chime").selectOption("bright");
  if (process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT) {
    await page.screenshot({ path: process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT, fullPage: true });
  }
  await page.getByRole("dialog").getByRole("button", { name: "Preview" }).click();
  await page.waitForFunction(() => window.__vantaAudioStarts.length === 5);
  console.log("desktop sound smoke: selected preview scheduled");
  await page.getByLabel("Play after each completed turn").uncheck();
  await page.getByRole("button", { name: "Close" }).click();
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("vanta.desktop.completion-sound.v1") ?? "null"));
  assert(persisted?.enabled === false && persisted?.sound === "bright", `preference did not persist: ${JSON.stringify(persisted)}`);
  const statusLabel = (await soundButton.textContent())?.trim() ?? "";
  assert(statusLabel.includes("Muted"), `mute status is not visible: ${statusLabel}`);
  console.log(JSON.stringify({ assistantRendered: true, softOscillators: softStarts, brightPreviewOscillators: 3, persisted, statusLabel }));
} finally {
  if (page) {
    await page.evaluate((previous) => {
      const key = "vanta.desktop.completion-sound.v1";
      if (previous === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previous);
    }, previousPreference).catch(() => undefined);
  }
  await app.close();
}

function instrumentAudioContext() {
  const NativeAudioContext = window.AudioContext;
  window.__vantaAudioStarts = [];
  window.AudioContext = class extends NativeAudioContext {
    createOscillator() {
      const oscillator = super.createOscillator();
      const nativeStart = oscillator.start.bind(oscillator);
      oscillator.start = (when = 0) => {
        window.__vantaAudioStarts.push({ frequency: oscillator.frequency.value, when });
        return nativeStart(when);
      };
      return oscillator;
    }
  };
}

async function audioStartCount(page) {
  return page.evaluate(() => window.__vantaAudioStarts.length);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)),
  ]);
}
