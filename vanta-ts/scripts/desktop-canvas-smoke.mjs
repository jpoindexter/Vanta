import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { _electron as electron } from "playwright-core";
import { canvasArtifactPath } from "../src/canvas/artifact.ts";
import { renderCanvasTool } from "../src/tools/render-canvas.ts";

const root = resolve(process.cwd(), "..");
const target = canvasArtifactPath(root);
const backup = `${target}.smoke-backup`;
const port = process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7817";
let hadArtifact = false;
let app;

try {
  await mkdir(dirname(target), { recursive: true });
  try { await copyFile(target, backup); hadArtifact = true; } catch { hadArtifact = false; }
  await render({
    kind: "table", title: "Launch checks", subtitle: "Interactive release evidence",
    table: { columns: [{ key: "check", label: "Check" }, { key: "status", label: "Status" }], rows: [{ check: "Types", status: "Pass" }, { check: "Electron", status: "Pending" }] },
  });

  app = await withTimeout(electron.launch({
    args: ["desktop-app/electron/main.mjs"], cwd: process.cwd(),
    env: { ...process.env, VANTA_DESKTOP_PORT: port, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
  }), 15_000, "Electron launch");
  const page = await withTimeout(app.firstWindow(), 15_000, "first window");
  page.setDefaultTimeout(7_000);
  await page.getByRole("heading", { name: "Launch checks" }).waitFor();
  await page.getByPlaceholder("Search this table").fill("Electron");
  await page.getByText("1 of 2 rows").waitFor();

  await render({
    kind: "board", title: "Build lane", subtitle: "Select a card to inspect it",
    board: { columns: [{ title: "Now", items: [{ title: "Canvas", status: "Building", detail: "Agent-rendered visual surface" }, { title: "Sentinel", status: "Next", detail: "Watch completed goals" }] }] },
  });
  await page.getByRole("button", { name: "Refresh canvas" }).click();
  await page.getByRole("heading", { name: "Build lane" }).waitFor();
  await page.getByRole("button", { name: /Sentinel/ }).click();
  await page.getByText("Watch completed goals").waitFor();

  await render({
    kind: "chart", title: "Verification trend", subtitle: "Toggle a series to inspect the chart",
    chart: { type: "line", categories: ["Contract", "API", "Desktop", "Native"], series: [{ name: "Passing checks", color: "#72d38d", values: [3, 5, 8, 11] }, { name: "Open checks", color: "#e0ad5b", values: [8, 6, 3, 1] }], xLabel: "Gate", yLabel: "Checks" },
  });
  await page.getByRole("button", { name: "Refresh canvas" }).click();
  await page.getByRole("heading", { name: "Verification trend" }).waitFor();
  const series = page.getByRole("button", { name: "Open checks" });
  await series.click();
  assert(await series.getAttribute("aria-pressed") === "false", "chart series did not toggle");
  if (process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT) await page.screenshot({ path: process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT, fullPage: true });
  await page.setViewportSize({ width: 720, height: 900 });
  const responsive = await page.evaluate(() => ({
    canvasVisible: getComputedStyle(document.querySelector(".right-rail")).display !== "none",
    workbenchHidden: getComputedStyle(document.querySelector(".workbench")).display === "none",
    fitsViewport: document.documentElement.scrollWidth <= window.innerWidth,
  }));
  assert(responsive.canvasVisible && responsive.workbenchHidden && responsive.fitsViewport, `responsive canvas failed: ${JSON.stringify(responsive)}`);
  if (process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT) await page.screenshot({ path: process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT.replace(/\.png$/, "-mobile.png") });
  console.log(JSON.stringify({ tableFilter: true, boardSelection: true, chartToggle: true, provenance: await page.getByText(/render_canvas/).isVisible(), responsive }));
} finally {
  await app?.close().catch(() => undefined);
  if (hadArtifact) { await copyFile(backup, target); await rm(backup, { force: true }); }
  else { await rm(target, { force: true }); await rm(backup, { force: true }); }
}

async function render(args) {
  const result = await renderCanvasTool.execute(args, { root, sessionId: "electron-smoke", safety: {}, requestApproval: async () => true });
  assert(result.ok, result.output);
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function withTimeout(promise, timeoutMs, label) { return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs))]); }
