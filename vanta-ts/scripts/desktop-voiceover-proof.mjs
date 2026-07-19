import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { _electron as electron } from "playwright-core";

const executablePath = resolve(process.env.VANTA_DESKTOP_APP ?? "release/mac-arm64/Vanta.app/Contents/MacOS/Vanta");
const artifactRoot = resolve(process.env.VANTA_ACCESSIBILITY_ARTIFACT_ROOT ?? ".vanta/accessibility-proof");
const videoPath = join(artifactRoot, "desktop-voiceover-proof.mov");
const receiptPath = join(artifactRoot, "desktop-voiceover-proof.json");
const project = await mkdtemp(join(tmpdir(), "vanta-voiceover-project-"));
const home = await mkdtemp(join(tmpdir(), "vanta-voiceover-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-voiceover-profile-"));
let approvalDecision = "";
let submittedMessage = "";
let app;
let recording;

try {
  await mkdir(artifactRoot, { recursive: true });
  await mkdir(join(home, "sessions"), { recursive: true });
  await writeFile(join(project, "README.md"), "# VoiceOver proof\n\nKeyboard-only context fixture.\n", "utf8");
  await writeFile(join(home, "sessions", "voiceover-proof.json"), JSON.stringify({
    id: "voiceover-proof",
    title: "VoiceOver release proof",
    started: "2026-07-19T00:00:00.000Z",
    updated: "2026-07-19T00:00:00.000Z",
    messages: [{ role: "assistant", content: "Ready for the keyboard-only assistive-technology proof." }],
  }), "utf8");

  execFileSync("open", ["-a", "VoiceOver"]);
  await delay(2_000);
  const voiceOverPid = execFileSync("pgrep", ["-f", "/VoiceOver.app/Contents/MacOS/VoiceOver"], { encoding: "utf8" }).trim();
  if (!voiceOverPid) throw new Error("VoiceOver did not start");

  app = await electron.launch({
    executablePath,
    args: ["--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: home,
      VANTA_HOME: home,
      VANTA_PROJECT_ROOT: project,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7998",
      VANTA_DESKTOP_AUTOMATION: "1",
      OPENAI_API_KEY: "vanta-voiceover-proof-key",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20_000);
  await page.route("**/api/files", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(["README.md"]) }));
  await page.route("**/api/file-context", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: ["README.md"], changed: [], recent: ["README.md"] }) }));
  await page.route("**/api/approval", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(approvalDecision ? null : {
          id: "voiceover-file-approval",
          action: "Review attached file README.md",
          reason: "Confirm the file is appropriate context for this task.",
          toolName: "read_file",
          request: {
            kind: "file_read",
            title: "File access permission request",
            subject: "README.md",
            reason: "Confirm the file is appropriate context for this task.",
            sections: [{ label: "Target file", value: "README.md", tone: "code" }],
          },
        }),
      });
      return;
    }
    approvalDecision = route.request().postDataJSON().decision;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.route("**/api/chat", async (route) => {
    submittedMessage = route.request().postDataJSON().message ?? "";
    if (approvalDecision !== "allow") {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Approval must be completed first." }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ finalText: "VoiceOver proof complete. README.md was attached and approved.", events: [{ label: "README.md reviewed", ok: true }] }),
    });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".app-shell").waitFor();
  await page.evaluate(() => {
    globalThis.__vantaPointerDowns = 0;
    window.addEventListener("pointerdown", () => { globalThis.__vantaPointerDowns += 1; }, true);
  });

  recording = spawn("/usr/sbin/screencapture", ["-v", "-V24", "-x", videoPath], { stdio: "ignore" });
  await delay(1_000);

  await activateWithKeyboard(page, page.getByRole("button", { name: "Attach project files" }));
  const filesPanel = page.locator(".files-panel");
  await filesPanel.getByText("Recent").waitFor();
  await activateWithKeyboard(page, filesPanel.getByTitle("README.md"));
  await page.getByLabel("Attached project context").getByText("README.md").waitFor();
  await activateWithKeyboard(page, page.getByRole("button", { name: "Close inspector" }));

  const approval = page.locator(".inline-approval");
  await approval.getByText("File access permission request").waitFor();
  await approval.getByText("README.md").first().waitFor();
  const approvalSnapshot = await approval.ariaSnapshot();
  await activateWithKeyboard(page, approval.getByRole("button", { name: "Allow once" }));
  await approval.waitFor({ state: "detached" });

  const composer = page.getByLabel("Message Vanta");
  await composer.focus();
  await page.keyboard.type("Review the attached file and return the result");
  await page.keyboard.press("Enter");
  await page.getByText("VoiceOver proof complete. README.md was attached and approved.").waitFor();
  const resultSnapshot = await page.locator(".conversation-stage").ariaSnapshot();
  const pointerDowns = await page.evaluate(() => globalThis.__vantaPointerDowns);
  if (pointerDowns !== 0) throw new Error(`Pointer input occurred during VoiceOver proof: ${pointerDowns}`);
  if (approvalDecision !== "allow") throw new Error(`Approval decision was ${approvalDecision || "missing"}`);
  if (!submittedMessage.includes("@README.md")) throw new Error("Attached README.md was not submitted as task context");

  await waitForExit(recording, 30_000);
  recording = undefined;
  const receipt = {
    generatedAt: new Date().toISOString(),
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    packagedSourceClean: execFileSync("git", ["status", "--porcelain", "--", "vanta-ts"], { encoding: "utf8" }).trim().length === 0,
    packagedApp: executablePath,
    voiceOverPid,
    pointerDowns,
    attached: ["README.md"],
    approvalDecision,
    resultReached: true,
    approvalSnapshot,
    resultSnapshot,
    videoPath,
  };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf8");
  process.stdout.write(`${JSON.stringify({ ...receipt, approvalSnapshot: true, resultSnapshot: true })}\n`);
} finally {
  if (recording && !recording.killed) recording.kill("SIGINT");
  await app?.close().catch(() => undefined);
  await Promise.all([
    rm(project, { recursive: true, force: true }),
    rm(home, { recursive: true, force: true }),
    rm(userData, { recursive: true, force: true }),
  ]);
  try { execFileSync("osascript", ["-e", "tell application \"VoiceOver\" to quit"]); } catch {}
}

async function activateWithKeyboard(page, locator) {
  await locator.waitFor();
  await locator.focus();
  await delay(1_000);
  await page.keyboard.press("Enter");
  await delay(1_000);
}

async function waitForExit(child, timeoutMs) {
  await Promise.race([
    new Promise((resolveExit, rejectExit) => {
      child.once("exit", (code) => code === 0 ? resolveExit() : rejectExit(new Error(`Screen recording exited ${code}`)));
      child.once("error", rejectExit);
    }),
    delay(timeoutMs).then(() => { child.kill("SIGINT"); throw new Error("Screen recording timed out"); }),
  ]);
}
