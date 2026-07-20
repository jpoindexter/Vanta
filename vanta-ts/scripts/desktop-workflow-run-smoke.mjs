import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright-core";

const home = await mkdtemp(join(tmpdir(), "vanta-workflow-smoke-home-"));
const project = await mkdtemp(join(tmpdir(), "vanta-workflow-smoke-project-"));
const profile = await mkdtemp(join(tmpdir(), "vanta-workflow-smoke-profile-"));
const runDir = join(project, ".vanta", "workflow-runs");
const runPath = join(runDir, "desktop-smoke.json");
let app;

try {
  await mkdir(runDir, { recursive: true });
  await writeFile(runPath, JSON.stringify(fixtureRun(), null, 2), "utf8");
  app = await electron.launch({
    args: ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: home,
      VANTA_HOME: home,
      VANTA_PROJECT_ROOT: project,
      VANTA_DESKTOP_USER_DATA: profile,
      VANTA_DESKTOP_PORT: "7836",
      VANTA_DESKTOP_AUTOMATION: "1",
      VANTA_PROVIDER: "openai",
      VANTA_MODEL: "gpt-4o-mini",
      OPENAI_API_KEY: "vanta-desktop-smoke-key",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(30_000);
  await page.locator(".app-shell").waitFor();
  await page.getByRole("button", { name: "Operate" }).click();
  await page.getByRole("heading", { name: "Execution replay" }).waitFor();
  await page.getByText("review-and-rework", { exact: true }).click();
  await page.getByText("review → build (revision)").waitFor();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.waitForFunction(async () => {
    const boundary = window.vantaDesktop?.boundaryToken ?? "";
    const response = await fetch("/api/workflow-runs/desktop-smoke", { headers: { "x-vanta-desktop-boundary": boundary } });
    const packet = await response.json();
    return packet.timeline?.some((event) => event.kind === "control" && event.label.startsWith("pause"));
  });
  const exported = await page.evaluate(() => fetch("/api/workflow-runs/desktop-smoke/export", { headers: { "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" } }).then((response) => response.json()));
  if (!exported.handoff.includes("never replayed by default")) throw new Error("handoff replay boundary missing");
  const persisted = JSON.parse(await readFile(runPath, "utf8"));
  if (persisted.operatorControl?.action !== "pause") throw new Error("pause control was not persisted");
  console.log("desktop workflow replay smoke passed");
} finally {
  if (app) await app.close().catch(() => app.process()?.kill("SIGKILL"));
  await Promise.all([home, project, profile].map((path) => rm(path, { recursive: true, force: true })));
}

function fixtureRun() {
  const at = "2026-07-20T12:00:00.000Z";
  return {
    version: 1, runId: "desktop-smoke", graphId: "review-and-rework", graphRevision: 1, revision: 4,
    status: "running", createdAt: at, updatedAt: at, values: { draft: "private" }, fieldRevisions: { draft: 1 },
    results: {
      build: { nodeId: "build", type: "agent", status: "ok", output: "private output", outputs: {}, handoffs: [] },
      review: { nodeId: "review", type: "review", status: "error", output: "private review", outputs: {}, handoffs: [] },
    },
    transcript: [],
    attempts: [
      { nodeId: "build", attempt: 1, startedAt: at, finishedAt: at, status: "ok" },
      { nodeId: "review", attempt: 1, startedAt: at, finishedAt: at, status: "error" },
    ],
    artifacts: [{ id: "draft", uri: "artifact://draft", revision: "1" }], evidence: [],
    decisions: [{ from: "review", to: "build", kind: "revision", at }],
    budget: { usedUsd: 0.01, usedTokens: 1200, noProgressSteps: 0 }, approvals: [],
    mutations: [{ nodeId: "build", attempt: 1, revision: 1, fields: ["draft"], at }],
    topologyRevision: 1, topologyChanges: [], operatorEvents: [], loopCounts: {},
  };
}
