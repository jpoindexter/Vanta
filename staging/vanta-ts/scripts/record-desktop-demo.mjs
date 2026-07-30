import { _electron as electron } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const port = process.env.VANTA_DESKTOP_DEMO_PORT ?? "7821";
const executablePath = process.env.VANTA_DESKTOP_APP;
const outputDir = resolve(process.env.VANTA_DEMO_OUTPUT ?? `artifacts/demo-capture/${timestamp()}`);
const secondsPerScene = Number(process.env.VANTA_DEMO_SECONDS_PER_SCENE ?? "4");
const makeVideo = process.env.VANTA_DEMO_VIDEO !== "0";
const scenes = [];

if (!Number.isFinite(secondsPerScene) || secondsPerScene <= 0) {
  throw new Error("VANTA_DEMO_SECONDS_PER_SCENE must be a positive number.");
}

mkdirSync(outputDir, { recursive: true });

const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: executablePath ? ["--project", resolve(process.cwd(), "..")] : ["desktop-app/electron/main.mjs"],
  cwd: process.cwd(),
  env: { ...process.env, VANTA_DESKTOP_PORT: port, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
});

try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole("heading", { name: "New session" }).waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "New session" }).click();
  await page.getByRole("heading", { name: "What should Vanta handle?" }).waitFor();
  await capture(page, "01-workspace", "Start a task in the desktop workbench");

  await page.getByTitle("Change model").click();
  await page.getByRole("dialog", { name: "Choose a model" }).waitFor();
  await capture(page, "02-model-picker", "Choose a model for this session");
  await page.getByRole("dialog", { name: "Choose a model" }).getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Open contextual inspector" }).click();
  await page.getByRole("button", { name: "Attach project files" }).click();
  await page.locator(".files-panel").waitFor();
  await capture(page, "03-project-context", "Attach project context before asking Vanta to act");
  await page.getByRole("button", { name: "Close inspector" }).click();

  await page.getByRole("button", { name: "Outputs", exact: true }).click();
  await page.getByRole("heading", { name: "Outputs" }).waitFor();
  await capture(page, "04-outputs", "Review deliverables and reopen their source session");

  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("heading", { name: "Connect" }).waitFor();
  await capture(page, "05-connect", "Inspect local connections and available capabilities");

  await page.getByRole("button", { name: "Work", exact: true }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Safety" }).click();
  await capture(page, "06-safety-policy", "Explain the approval policy before an action crosses the kernel boundary");
  await settings.getByRole("button", { name: "Close" }).click();

  await page.route("**/api/approval", (route) => {
    if (route.request().method() === "POST") return route.fulfill({ status: 204 });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(demoApproval()),
    });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Allow this project-scoped file write?" }).waitFor({ timeout: 5_000 });
  await capture(page, "07-simulated-approval", "SIMULATED: show the human approval gate before a scoped write", true);
} finally {
  await app.close();
}

const manifest = {
  generatedAt: new Date().toISOString(),
  viewport: "1440x960",
  secondsPerScene,
  scenes,
  fixtureScenes: scenes.filter((scene) => scene.fixture).map((scene) => scene.file),
};
writeFileSync(resolve(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

if (makeVideo) renderVideo(outputDir, secondsPerScene);
console.log(JSON.stringify({ outputDir, scenes: scenes.length, video: makeVideo ? resolve(outputDir, "vanta-desktop-tour.mp4") : null }));

async function capture(page, name, narration, fixture = false) {
  const file = `${name}.png`;
  await page.screenshot({ path: resolve(outputDir, file), animations: "disabled" });
  scenes.push({ file, narration, fixture });
}

function renderVideo(directory, duration) {
  const output = resolve(directory, "vanta-desktop-tour.mp4");
  try {
    execFileSync("ffmpeg", [
      "-y",
      "-framerate", `1/${duration}`,
      "-pattern_type", "glob",
      "-i", resolve(directory, "*.png"),
      "-vf", "fps=30",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      output,
    ], { stdio: "inherit" });
  } catch (error) {
    throw new Error(`Scene images were captured, but the MP4 was not created. Install ffmpeg or rerun with VANTA_DEMO_VIDEO=0. ${error instanceof Error ? error.message : String(error)}`);
  }
}

function demoApproval() {
  return {
    id: "demo-file-write-approval",
    action: "write a project-scoped demo note",
    reason: "This is a local presentation fixture. It does not call the Vanta kernel or write a file.",
    toolName: "file_write",
    request: {
      kind: "file_write",
      title: "Allow this project-scoped file write?",
      subject: "staging/docs/demo-note.md",
      reason: "A human must choose before a scoped write can proceed.",
      sections: [
        { label: "Scope", value: "Current project only", tone: "muted" },
        { label: "Action", value: "Create staging/docs/demo-note.md", tone: "code" },
        { label: "Fixture", value: "Simulated — no real action will run", tone: "danger" },
      ],
    },
  };
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
