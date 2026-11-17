// Visual proof: screenshots every page/state this track owns from the fixtures harness
// at 1440/1100/800, light and dark, into docs/proofs/pages/<width>/<theme>/.
//   node tools/shoot-pages.mjs [--out docs/proofs/pages] [--url http://127.0.0.1:5291] [--only home,palette] [--width 1440] [--theme dark]
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { SCREENS, STATES, STATE_SCREENS, THEMES, WIDTHS } from "./pages-scenarios.mjs";

const root = path.resolve(import.meta.dirname, "..");
const { chromium } = createRequire(import.meta.url)("playwright-core");
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const outDir = path.resolve(root, arg("--out", "docs/proofs/pages"));
const base = arg("--url", "http://127.0.0.1:5291");
const only = arg("--only", "") ? arg("--only", "").split(",") : null;
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function ensureServer() {
  try { await fetch(base); return null; } catch { /* start one */ }
  const child = spawn("npx", ["vite", "--port", new URL(base).port, "--host", "127.0.0.1"], { cwd: path.join(root, "apps/desktop"), stdio: "ignore" });
  for (let i = 0; i < 60; i++) { try { await fetch(base); return child; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  throw new Error("fixtures dev server did not start");
}

const jobs = [];
for (const sc of SCREENS) {
  if (sc.wireframeHasScreen === false && !sc.id.startsWith("settings")) continue;
  jobs.push({ name: sc.id, query: sc.query, built: sc.built });
  if (STATE_SCREENS.includes(sc.id)) for (const st of STATES) jobs.push({ name: `${sc.id}--${st}`, query: `${sc.query}&state=${st}` });
}

const server = await ensureServer();
const browser = await chromium.launch({ executablePath: CHROME });
let count = 0;
for (const width of WIDTHS) for (const theme of THEMES) {
  if ((args.includes("--width") && Number(arg("--width")) !== width) || (args.includes("--theme") && arg("--theme") !== theme)) continue;
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 740 }, reducedMotion: "reduce" })).newPage();
  const dir = path.join(outDir, String(width), theme);
  fs.mkdirSync(dir, { recursive: true });
  for (const job of jobs) {
    if (only && !only.some((o) => job.name.startsWith(o))) continue;
    await page.goto(`${base}/vanta-fixtures.html?${job.query}&w=${width}&theme=${theme}`);
    await page.waitForSelector("#frame");
    await page.waitForTimeout(350);
    if (job.built) await job.built(page);
    await page.locator("#frame").screenshot({ path: path.join(dir, `${job.name}.png`) });
    count++;
  }
  await page.context().close();
}
await browser.close();
if (server) server.kill();
console.log(`wrote ${count} screenshots to ${outDir}`);
