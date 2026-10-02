// Records only the installed app's renderer. Interact manually; no simulated model.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const output = resolve(process.env.VANTA_DEMO_OUTPUT ?? ".artifacts/interview-demo");
const root = await mkdtemp(join(tmpdir(), "vanta-interview-demo-"));
const project = join(root, "Interview Demo");
const state = join(root, "state");
const profile = join(root, "profile");
const executablePath = "/Applications/Vanta.app/Contents/MacOS/Vanta";
const archive = "/Applications/Vanta.app/Contents/Resources/app.asar";
await Promise.all([output, project, state, profile].map((path) => mkdir(path, { recursive: true })));
const metadata = {
  startedAt: new Date().toISOString(), executablePath, project, state, profile,
  sha256: createHash("sha256").update(await readFile(archive)).digest("hex"),
  provider: "codex", model: process.env.VANTA_DEMO_MODEL ?? "gpt-5.6-sol",
  boundary: "Live provider; isolated app state; renderer-only recording; no scripted interactions.",
};
await writeFile(join(output, "session.json"), JSON.stringify(metadata, null, 2));
const app = await electron.launch({
  executablePath,
  args: ["--project", project, "--no-companion", "--force-renderer-accessibility"],
  cwd: process.cwd(),
  recordVideo: { dir: output, size: { width: 1440, height: 960 } },
  env: {
    HOME: homedir(), PATH: process.env.PATH ?? "/usr/bin:/bin:/opt/homebrew/bin",
    TMPDIR: tmpdir(), LANG: "en_US.UTF-8",
    VANTA_HOME: state, VANTA_DESKTOP_USER_DATA: profile,
    VANTA_DESKTOP_AUTOMATION: "1", VANTA_DESKTOP_PORT: "18791",
    VANTA_PROVIDER: metadata.provider, VANTA_MODEL: metadata.model,
    VANTA_MCP_AUTO_MOUNT: "0", VANTA_PROMPT_SUGGESTIONS: "0",
    VANTA_OPERATING_MODE: "default", VANTA_PERMISSION_MODE: "default",
  },
});
const page = await app.firstWindow();
const video = page.video();
const rendererErrors = [];
page.on("pageerror", (error) => rendererErrors.push(error.message));
console.log(`Recording installed Vanta. Demo project: ${project}`);
console.log("Quit Vanta normally to finalize the recording. No automation grants were added.");
await new Promise((done) => app.once("close", done));
await writeFile(join(output, "result.json"), JSON.stringify({
  ...metadata, endedAt: new Date().toISOString(), rendererErrors,
  video: video ? await video.path() : null,
  verification: "Recording only; workflow success requires separate visible/artifact evidence.",
}, null, 2));
console.log(`Recording finalized: ${output}`);
