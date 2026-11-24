import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright-core";

const sourceProject = await mkdtemp(join(tmpdir(), "vanta-project-switch-source-"));
const targetProject = await mkdtemp(join(tmpdir(), "vanta-project-switch-target-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-project-switch-profile-"));
const vantaHome = await mkdtemp(join(tmpdir(), "vanta-project-switch-home-"));
const instruction = "Retain this exact draft across the project switch.";
const nativePicker = process.env.VANTA_DESKTOP_NATIVE_PROJECT_PICKER === "1";
let app;
const hostOutput = [];
let expectedTargetRoot;

try {
  await writeFile(join(sourceProject, "SOURCE.md"), "source project\n");
  await writeFile(join(targetProject, "TARGET.md"), "target project\n");
  expectedTargetRoot = await realpath(targetProject);
  app = await electron.launch({
    args: ["desktop-app/electron/main.mjs", "--project", sourceProject],
    cwd: process.cwd(),
    env: {
      ...process.env,
      VANTA_HOME: vantaHome,
      VANTA_PROJECT_ROOT: sourceProject,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7846",
      VANTA_DESKTOP_AUTOMATION: "1",
      OPENAI_API_KEY: "vanta-project-switch-smoke-key",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  app.process().stdout?.on("data", (chunk) => hostOutput.push(chunk.toString()));
  app.process().stderr?.on("data", (chunk) => hostOutput.push(chunk.toString()));
  const page = await app.firstWindow();
  page.setDefaultTimeout(30_000);
  await page.locator(".app-shell").waitFor();
  await page.waitForFunction(() => {
    const composer = document.querySelector("#vanta-composer");
    return composer instanceof HTMLTextAreaElement && !composer.disabled;
  });

  if (nativePicker) {
    const nativeSelection = page.evaluate((path) => window.vantaDesktop?.pickProjectFolder(path), targetProject);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
    execFileSync("/usr/bin/osascript", ["-e", [
      "on run argv",
      "tell application \"System Events\"",
      "set targetProcess to first application process whose unix id is (item 1 of argv as integer)",
      "set frontmost of targetProcess to true",
      "delay 0.5",
      "tell targetProcess to key code 36",
      "end tell",
      "end run",
    ].join("\n"), String(app.process().pid)], { stdio: "pipe" });
    assert.equal(await nativeSelection, targetProject, "native project picker did not return its selected directory");
    console.log(JSON.stringify({ nativePicker: true, selectedDirectory: true }));
  } else {
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, targetProject);
    await page.locator(".session-sidebar").getByRole("button", { name: "New task", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Start a new task" });
    await dialog.getByRole("button", { name: "Choose project folder" }).click();
    const selectedProject = await dialog.getByRole("textbox", { name: "Project folder" }).inputValue();
    assert.equal(selectedProject, targetProject);
    await dialog.getByRole("textbox", { name: "Base branch" }).fill("codex/switch-proof");
    await dialog.getByRole("textbox", { name: "First instruction" }).fill(instruction);
    await dialog.getByRole("button", { name: "Create and run" }).click();

    await page.waitForFunction(async ({ root, prompt }) => {
      const status = await fetch("/api/status", { headers: { "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" } }).then((response) => response.json()).catch(() => null);
      const composer = document.querySelector("#vanta-composer");
      return status?.root === root && composer instanceof HTMLTextAreaElement && composer.value.includes(prompt) && !composer.disabled;
    }, { root: expectedTargetRoot, prompt: instruction });

    let result;
    let lastSnapshot;
    for (let attempt = 0; attempt < 20 && !result; attempt += 1) {
      lastSnapshot = await page.evaluate(async () => {
        const status = await fetch("/api/status", { headers: { "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" } }).then((response) => response.json()).catch(() => null);
        const draft = document.querySelector("#vanta-composer")?.value ?? "";
        return { status, draft, title: document.title, readyState: document.readyState };
      }).catch(() => null);
      result = lastSnapshot?.status?.root && lastSnapshot?.draft ? lastSnapshot : null;
      if (!result) await page.waitForTimeout(100);
    }
    assert.ok(result, `switched renderer did not remain reachable: ${JSON.stringify({ url: page.url(), snapshot: lastSnapshot, output: hostOutput.slice(-20) })}`);
    assert.equal(result.status.root, expectedTargetRoot);
    assert.match(result.draft, new RegExp(instruction.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(result.draft, /Branch: codex\/switch-proof/);
    assert.match(result.draft, new RegExp(`Project: ${expectedTargetRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.equal(await page.evaluate(() => window.vantaDesktop?.readPendingProjectTask()), null);
    console.log(JSON.stringify({
      projectSwitch: true,
      nativePicker: false,
      runtimeRoot: result.status.root,
      draftRecovered: true,
      handoffAcknowledged: true,
    }));
  }
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([
    rm(sourceProject, { recursive: true, force: true }),
    rm(targetProject, { recursive: true, force: true }),
    rm(userData, { recursive: true, force: true }),
    rm(vantaHome, { recursive: true, force: true }),
  ]);
}
