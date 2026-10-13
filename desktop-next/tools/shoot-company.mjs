// Visual proof for the Company screens: every tab in every state from the dev-only fixtures page
// (company-fixtures.html, payloads recorded off the real server), headless and off-screen.
//   node tools/shoot-company.mjs [--out docs/proofs/company] [--url http://127.0.0.1:5292] [--only workers,tickets]
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const { chromium } = createRequire(import.meta.url)("playwright-core");
const args = process.argv.slice(2);
const arg = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback);
const outDir = path.resolve(root, arg("--out", "docs/proofs/company"));
const base = arg("--url", "http://127.0.0.1:5292");
const only = arg("--only", "") ? arg("--only", "").split(",") : null;
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const click = (name) => (p) => p.getByRole("button", { name }).first().click();
const fillDialog = (label, value) => (p) => p.getByRole("dialog").getByLabel(label).fill(value);
const submitIn = (name) => (p) => p.getByRole("dialog").getByRole("button", { name }).click();

const STATES = ["ready", "loading", "empty", "error"];
const perState = (tab, extra = "") => STATES.map((state) => ({ id: `${tab}-${state}`, query: `tab=${tab}&state=${state}${extra}` }));

const SCENARIOS = [
  ...perState("workers"),
  { id: "workers-offline", query: "tab=workers&state=offline" },
  { id: "workers-hire-dialog", query: "tab=workers", steps: [click("Hire worker")] },
  {
    id: "workers-hire-approval",
    query: "tab=workers",
    steps: [click("Hire worker"), fillDialog("Role", "Copywriter"), fillDialog("Budget (US dollars)", "1.5"), submitIn("Hire and ask me to approve")],
    wait: "[data-vp='approval-card']",
  },
  {
    id: "workers-hire-declined",
    query: "tab=workers",
    steps: [click("Hire worker"), fillDialog("Role", "Copywriter"), submitIn("Hire and ask me to approve"), submitIn("Reject")],
    wait: "text=Declined. Nothing changed.",
  },
  ...perState("tickets"),
  { id: "tickets-board", query: "tab=tickets", steps: [click("Board")] },
  { id: "tickets-create-dialog", query: "tab=tickets", steps: [click("New ticket")] },
  { id: "ticket-in-review", query: "tab=tickets&ticket=T-3" },
  { id: "ticket-blocked", query: "tab=tickets&ticket=T-4" },
  { id: "ticket-closeable", query: "tab=tickets&ticket=T-5" },
  { id: "ticket-done", query: "tab=tickets&ticket=T-1" },
  { id: "ticket-error", query: "tab=tickets&ticket=T-404" },
  ...perState("budgets"),
  {
    id: "budgets-raise-approval",
    query: "tab=budgets",
    steps: [click("Raise budget: Designer (worker)"), fillDialog("New limit (US dollars)", "0.5"), submitIn("Raise and ask me to approve")],
    wait: "[data-vp='approval-card']",
  },
  ...perState("activity"),
];

async function ensureServer() {
  try { await fetch(base); return null; } catch { /* start one */ }
  const child = spawn("npx", ["vite", "--port", new URL(base).port, "--host", "127.0.0.1"], { cwd: path.join(root, "apps/desktop"), stdio: "ignore" });
  for (let i = 0; i < 80; i++) { try { await fetch(base); return child; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  throw new Error("fixtures dev server did not start");
}

const sets = [
  { width: 1440, theme: "light" },
  { width: 1440, theme: "dark" },
  { width: 1100, theme: "light" },
];

const server = await ensureServer();
const browser = await chromium.launch({ executablePath: CHROME });
let count = 0;
try {
  fs.mkdirSync(outDir, { recursive: true });
  for (const { width, theme } of sets) {
    const context = await browser.newContext({ viewport: { width: width + 60, height: 1700 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    for (const scenario of SCENARIOS) {
      if (only && !only.some((prefix) => scenario.id.startsWith(prefix))) continue;
      await page.goto(`${base}/company-fixtures.html?${scenario.query}&w=${width}&theme=${theme}`);
      await page.waitForSelector("#frame");
      await page.waitForTimeout(450);
      for (const step of scenario.steps ?? []) { await step(page); await page.waitForTimeout(150); }
      if (scenario.wait) await page.waitForSelector(scenario.wait, { timeout: 5000 });
      await page.waitForTimeout(300);
      await page.locator("#frame").screenshot({ path: path.join(outDir, `${scenario.id}-${theme}-${width}.png`) });
      count++;
    }
    await context.close();
  }
} finally {
  await browser.close();
  if (server) server.kill();
}
console.log(`wrote ${count} screenshots to ${outDir}`);
