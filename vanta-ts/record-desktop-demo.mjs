import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const root = resolve(process.cwd(), "..");
const outputDir = resolve(process.env.VANTA_DEMO_OUTPUT ?? join(process.cwd(), ".artifacts", "desktop-demo", stamp()));
const secondsPerScene = Number(process.env.VANTA_DEMO_SECONDS_PER_SCENE ?? "4");
const makeVideo = process.env.VANTA_DEMO_VIDEO !== "0";
const port = process.env.VANTA_DESKTOP_DEMO_PORT ?? "7840";
const scenes = [];
const home = await mkdtemp(join(tmpdir(), "vanta-demo-home-"));
const profile = await mkdtemp(join(tmpdir(), "vanta-demo-profile-"));
const project = await mkdtemp(join(tmpdir(), "vanta-demo-project-"));
let app;

if (!Number.isFinite(secondsPerScene) || secondsPerScene <= 0) throw new Error("VANTA_DEMO_SECONDS_PER_SCENE must be positive.");
await mkdir(outputDir, { recursive: true });

try {
  await seedFixture();
  app = await electron.launch({
    args: ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: home,
      VANTA_HOME: home,
      VANTA_PROJECT_ROOT: project,
      VANTA_DESKTOP_USER_DATA: profile,
      VANTA_DESKTOP_PORT: port,
      VANTA_DESKTOP_AUTOMATION: "1",
      VANTA_PROVIDER: "openai",
      VANTA_MODEL: "gpt-4o-mini",
      OPENAI_API_KEY: "vanta-demo-fixture-key",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator(".app-shell").waitFor();
  await page.waitForFunction(() => !document.querySelector("#vanta-composer")?.hasAttribute("disabled"));

  await capture(page, "01-workspace", "Start from one clear task in the Vanta workbench.");

  await page.locator(".composer").getByTitle("Change agent model").click();
  await page.getByRole("heading", { name: "Choose a model" }).waitFor();
  await capture(page, "02-model-picker", "Choose the model for this task before it runs.");
  await page.getByRole("button", { name: "Close model picker" }).click();

  await page.getByRole("button", { name: "Attach project files" }).click();
  await page.locator(".files-panel").waitFor();
  const file = page.locator(".file-list button").first();
  await file.click();
  await capture(page, "03-project-context", "Attach only the project context the task needs.");
  await page.getByRole("button", { name: "Close inspector" }).click();

  await page.getByRole("button", { name: "Open commands" }).click();
  const commands = page.getByRole("dialog", { name: "Command palette" });
  await commands.getByRole("button", { name: "Canvas" }).click();
  await page.locator(".canvas-panel").getByRole("heading", { name: "Demo verification trend" }).waitFor();
  await capture(page, "04-live-canvas", "Open an agent-produced canvas and inspect the underlying trend.");
  await page.getByRole("button", { name: "Close inspector" }).click();

  await page.route(/\/api\/chat$/, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      finalText: "I drafted docs/demo-output.md and kept the run trace available.",
      events: [
        { label: "✓ read_file: README.md", ok: true, kind: "tool_end", name: "read_file", detail: "Demo fixture context" },
        { label: "✓ write_file: docs/demo-output.md", ok: true, kind: "tool_end", name: "write_file", detail: "Created a scoped draft" },
      ],
    }),
  }));
  await page.locator("#vanta-composer").fill("Draft a short demo output from the project context.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByText("I drafted docs/demo-output.md and kept the run trace available.").waitFor();
  await capture(page, "05-trace-and-result", "See the result with the task trace, not a black box.", true);

  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.locator(".operator-view").getByRole("heading", { name: "Connect", exact: true }).waitFor();
  await capture(page, "06-connect-overview", "Inspect what is configured before Vanta uses it.");
  await page.getByRole("tab", { name: "Capabilities" }).click();
  await page.getByText("Demo recording skill").waitFor();
  await capture(page, "07-capabilities", "Capabilities and project skills are visible before use.");

  await page.getByRole("button", { name: "Outputs", exact: true }).click();
  await page.locator(".operator-view").getByRole("heading", { name: "Outputs", exact: true }).waitFor();
  await page.getByText("docs/demo-output.md").waitFor();
  await capture(page, "08-outputs", "Review what Vanta produced and return to the source session.");

  await page.getByRole("button", { name: "Work", exact: true }).click();
  await page.locator(".session-sidebar-footer").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  await page.getByRole("button", { name: "Safety", exact: true }).click();
  await capture(page, "09-safety-policy", "Actions crossing the kernel boundary follow the configured approval policy.");
  await page.getByRole("button", { name: "Close" }).click();

  await page.route("**/api/approval", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 204 })
    : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(demoApproval()) }));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".inline-approval").getByText("Allow this project-scoped file write?").waitFor();
  await capture(page, "10-simulated-approval", "SIMULATED: a person chooses before a scoped write proceeds.", true);
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([home, profile, project].map((path) => rm(path, { recursive: true, force: true })));
}

await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), viewport: "1440x960", secondsPerScene, scenes }, null, 2)}\n`);
if (makeVideo) renderVideo();
console.log(JSON.stringify({ outputDir, scenes: scenes.length, video: makeVideo ? join(outputDir, "vanta-desktop-demo.mp4") : null }));

async function seedFixture() {
  await mkdir(join(home, "sessions"), { recursive: true });
  await mkdir(join(home, "skills", "demo-recording"), { recursive: true });
  await mkdir(join(project, "docs"), { recursive: true });
  await mkdir(join(project, ".vanta"), { recursive: true });
  await writeFile(join(project, "README.md"), "Fixture project used only to record the Vanta desktop demo.\n");
  await writeFile(join(project, "docs", "demo-output.md"), "A scoped demonstration output.\n");
  await writeFile(join(project, ".vanta", "canvas.json"), JSON.stringify({
    version: 1, id: "demo-verification-trend", title: "Demo verification trend", subtitle: "Fixture-only release checks", createdAt: "2026-07-21T00:00:00.000Z", source: { tool: "render_canvas" },
    kind: "chart", chart: { type: "line", categories: ["Contract", "API", "Desktop", "Native"], series: [{ name: "Passing checks", color: "#72d38d", values: [3, 5, 8, 11] }, { name: "Open checks", color: "#e0ad5b", values: [8, 6, 3, 1] }], xLabel: "Gate", yLabel: "Checks" },
  }, null, 2));
  await writeFile(join(home, "skills", "demo-recording", "SKILL.md"), "---\nname: Demo recording skill\ndescription: Fixture-only capability for the desktop demo.\n---\nUse the fixture safely.\n");
  await writeFile(join(home, "sessions", "demo-session.json"), JSON.stringify({
    id: "demo-session", title: "Recorded demo fixture", started: "2026-07-21T00:00:00.000Z", updated: "2026-07-21T00:00:00.000Z",
    messages: [{ role: "assistant", content: "Produced docs/demo-output.md" }],
  }));
}

async function capture(page, name, narration, fixture = false) {
  const file = `${name}.png`;
  await page.screenshot({ path: join(outputDir, file), animations: "disabled" });
  scenes.push({ file, narration, fixture });
}

function renderVideo() {
  try {
    execFileSync("ffmpeg", ["-y", "-framerate", `1/${secondsPerScene}`, "-pattern_type", "glob", "-i", join(outputDir, "*.png"), "-vf", "fps=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(outputDir, "vanta-desktop-demo.mp4")], { stdio: "inherit" });
  } catch (error) {
    throw new Error(`Scene PNGs were captured but MP4 creation failed. Install ffmpeg or rerun with VANTA_DEMO_VIDEO=0. ${error instanceof Error ? error.message : String(error)}`);
  }
}

function demoApproval() {
  return { id: "demo-approval", action: "write a scoped demo note", reason: "Fixture only; no real action is sent to the Vanta kernel.", toolName: "file_write", request: { kind: "file_write", title: "Allow this project-scoped file write?", subject: "docs/demo-output.md", reason: "A person must choose before a scoped write proceeds.", sections: [{ label: "Scope", value: "Current project only", tone: "muted" }, { label: "Action", value: "Write docs/demo-output.md", tone: "code" }, { label: "Fixture", value: "Simulated — no action will run", tone: "danger" }] } };
}

function stamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }
