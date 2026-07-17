import { _electron as electron } from "playwright-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = process.env.VANTA_DESKTOP_RUNTIME_SMOKE_PORT ?? "7823";
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-runtime-profile-"));
const app = await electron.launch({
  args: ["desktop-app/electron/main.mjs"],
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

try {
  const page = await app.firstWindow();
  await page.route("**/api/runtime", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      selectedHostId = body.hostId;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ selectedHostId, hosts: [local, remote] }) });
  });
  await page.locator(".app-shell").waitFor({ timeout: 20_000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".app-shell.theme-dark").waitFor({ timeout: 15_000 });
  await page.locator("[data-runtime-strip]").waitFor();

  const composer = page.getByPlaceholder("Ask Vanta to do something...");
  await composer.fill("Draft survives runtime switching");
  const dark = await inspectRuntime(page, "dark");

  const trigger = page.locator(".runtime-strip-trigger");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Runtime details" });
  await dialog.waitFor();
  const screenReader = await dialog.evaluate((element) => ({
    role: element.getAttribute("role"),
    label: element.getAttribute("aria-label"),
    modal: element.getAttribute("aria-modal"),
    switcher: element.querySelector('[role="group"]')?.getAttribute("aria-label"),
    pressed: [...element.querySelectorAll("button[aria-pressed]")].map((button) => button.getAttribute("aria-pressed")),
  }));
  if (screenReader.role !== "dialog" || screenReader.label !== "Runtime details" || screenReader.modal !== "false" || screenReader.switcher !== "Switch runtime host") {
    throw new Error(`runtime screen-reader contract is incomplete: ${JSON.stringify(screenReader)}`);
  }

  await dialog.getByRole("button", { name: /Remote Fixture/ }).click();
  await trigger.getByText("Remote Fixture").waitFor();
  if (await composer.inputValue() !== "Draft survives runtime switching") throw new Error("runtime host switch dropped the active draft");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  if (!await trigger.evaluate((element) => element === document.activeElement)) throw new Error("runtime trigger did not regain focus after Escape");

  await page.evaluate(() => localStorage.setItem("vanta.desktop.theme", "light"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".app-shell.theme-light").waitFor();
  const light = await inspectRuntime(page, "light");

  const closeInspector = page.locator(".app-titlebar").getByRole("button", { name: "Close inspector" });
  if (await closeInspector.count()) await closeInspector.click();
  await page.setViewportSize({ width: 760, height: 900 });
  await page.waitForTimeout(250);
  const work = page.locator(".mobile-nav").getByRole("button", { name: "Work" });
  if (await work.count()) await work.click();
  const compact = await inspectRuntime(page, "light-compact");
  if (process.env.VANTA_DESKTOP_RUNTIME_SCREENSHOT) await page.screenshot({ path: process.env.VANTA_DESKTOP_RUNTIME_SCREENSHOT });

  console.log(JSON.stringify({ ok: true, dark, light, compact, screenReader, draftPreserved: true, keyboardClose: true }));
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
  };
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
