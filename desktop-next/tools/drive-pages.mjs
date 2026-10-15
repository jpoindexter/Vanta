// Drives every control in the fixtures harness in a real browser and asserts what it did, plus
// keyboard focus, 12px floor, reduced motion and text contrast. Exits non-zero on any failure.
//   node tools/drive-pages.mjs [--url http://127.0.0.1:5291] [--out docs/proofs/pages/interaction]
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const { chromium } = createRequire(import.meta.url)("playwright-core");
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const base = arg("--url", "http://127.0.0.1:5291");
const outDir = path.resolve(root, arg("--out", "docs/proofs/pages/interaction"));
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function ensureServer() {
  try { await fetch(base); return null; } catch { /* start one */ }
  const child = spawn("npx", ["vite", "--port", new URL(base).port, "--host", "127.0.0.1"], { cwd: path.join(root, "apps/desktop"), stdio: "ignore" });
  for (let i = 0; i < 60; i++) { try { await fetch(base); return child; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  throw new Error("fixtures dev server did not start");
}

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` :: ${detail}`}`); };
const events = (p) => p.evaluate(() => window.__vpEvents ?? []);

const server = await ensureServer();
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 740 } });
const page = await ctx.newPage();
const open = async (qs) => { await page.goto(`${base}/vanta-fixtures.html?${qs}`); await page.waitForSelector("#frame"); await page.waitForTimeout(400); };
const shot = (name) => page.locator("#frame").screenshot({ path: path.join(outDir, `${name}.png`) });

// ---- Home
await open("screen=home&theme=light");
await page.getByLabel("Start a task").click();
await page.keyboard.type("Summarise my Downloads PDFs");
await page.getByRole("button", { name: "Research" }).click();
await page.getByLabel("Start a task").click();
await page.keyboard.press("Enter");
check("home: Enter submits the task with the chosen project", JSON.stringify((await events(page)).at(-1)) === JSON.stringify(["submitTask", "Summarise my Downloads PDFs", "research"]), JSON.stringify(await events(page)));
await page.getByRole("button", { name: "Allow once: Refactor billing webhooks" }).click();
check("home: Allow once fires with the session id", JSON.stringify((await events(page)).at(-1)) === JSON.stringify(["allowOnce", "s1"]));
await page.getByRole("button", { name: "Stop Fix flaky skills test" }).click();
check("home: Stop fires", (await events(page)).at(-1)?.[0] === "stopRun");
await page.getByRole("button", { name: "Run now: Competitor pricing monitor" }).click();
check("home: Run now fires", (await events(page)).at(-1)?.[0] === "runSchedule");
await page.getByRole("button", { name: "Reveal q4-launch-plan.md" }).click();
check("home: Reveal fires", (await events(page)).at(-1)?.[0] === "revealOutput");
await page.keyboard.press("Tab");
await page.getByRole("button", { name: "Open Weekly competitor brief" }).focus();
await page.keyboard.press("Tab");
const ring = await page.evaluate(() => { const el = document.activeElement; const cs = getComputedStyle(el); return { w: cs.outlineWidth, s: cs.outlineStyle, c: cs.outlineColor, tag: el.tagName, name: el.getAttribute("aria-label") }; });
check("home: keyboard focus shows a 2px outline", ring.s === "solid" && ring.w === "2px", JSON.stringify(ring));
await shot("home-focus-ring");

// ---- Home error block retry
await open("screen=home&state=error");
await page.getByRole("button", { name: "Retry" }).first().click();
check("home: block Retry fires", (await events(page)).at(-1)?.[0] === "retry");

// ---- List pages
for (const [screen, btn, label] of [["schedules", "Run now: Inbox digest", "Run now"], ["connections", "Reconnect: GitHub", "Reconnect"], ["outputs", "Locate: old-report.docx", "Locate"]]) {
  await open(`screen=${screen}`);
  await page.getByRole("button", { name: btn }).click();
  check(`${screen}: ${label} fires rowAction`, (await events(page)).at(-1)?.[0] === "rowAction");
}
await open("screen=skills");
await page.getByRole("button", { name: "Browse skills" }).click();
check("skills: primary CTA fires", (await events(page)).at(-1)?.[0] === "primary");

// ---- Palette
await open("screen=palette");
const focused = await page.evaluate(() => document.activeElement?.getAttribute("role"));
check("palette: input is focused on open", focused === "combobox", String(focused));
await page.keyboard.type("go to");
check("palette: filter leaves three Go to commands", (await page.getByRole("option").count()) === 3);
await page.keyboard.press("ArrowDown");
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Enter");
check("palette: arrows then Enter run the third command", JSON.stringify((await events(page)).at(-1)) === JSON.stringify(["paletteRun", "connections"]), JSON.stringify(await events(page)));
await page.keyboard.press("Escape");
check("palette: Escape closes", (await events(page)).at(-1)?.[0] === "paletteClose");
await page.keyboard.press("Control+a"); await page.keyboard.type("zzz");
check("palette: shows No matches.", await page.getByText("No matches.").isVisible());
await shot("palette-no-matches-focus");

// ---- Workbench
await open("screen=workbench&tab=changes");
await page.getByRole("tab", { name: "Changes" }).focus();
await page.keyboard.press("ArrowRight");
check("workbench: ArrowRight selects Files and moves focus", (await page.getByRole("tab", { name: "Files" }).getAttribute("aria-selected")) === "true" && (await page.evaluate(() => document.activeElement?.textContent)) === "Files");
await page.keyboard.press("End");
check("workbench: End selects Outputs", (await page.getByRole("tab", { name: "Outputs" }).getAttribute("aria-selected")) === "true");
await page.getByRole("tab", { name: "Changes" }).click();
await page.getByRole("button", { name: "Restore to before this run" }).click();
check("workbench: Restore fires", (await events(page)).at(-1)?.[0] === "restore");
await page.getByRole("tab", { name: "Files" }).click();
await page.getByRole("button", { name: "retry.ts" }).click();
check("workbench: selecting a file fires", JSON.stringify((await events(page)).at(-1)) === JSON.stringify(["selectFile", "billing/retry.ts"]));
await page.keyboard.press("Escape");
check("workbench: Escape closes", (await events(page)).at(-1)?.[0] === "workbenchClose");
await page.getByRole("button", { name: "Close workbench" }).click();
check("workbench: close button fires", (await events(page)).at(-1)?.[0] === "workbenchClose");

// ---- Settings
await open("screen=settings");
await page.getByRole("button", { name: "Change: Launch" }).click();
await page.getByRole("radio", { name: "Home" }).click();
await page.waitForTimeout(300);
check("settings: choosing a value saves at once", JSON.stringify((await events(page)).at(-1)) === JSON.stringify(["save", "launch", "Home"]));
check("settings: row shows the new value", (await page.locator(".vp-row .vp-note", { hasText: "Home" }).count()) === 1);
await page.getByRole("button", { name: "Manage: Remembered approvals" }).click();
check("settings: Manage opens Permissions", (await page.getByRole("button", { name: "Permissions" }).getAttribute("aria-current")) === "true");
await page.getByRole("button", { name: "Revoke Shell commands in Vanta" }).click();
await page.waitForTimeout(300);
check("settings: Revoke removes the row and fires", (await page.getByRole("button", { name: "Revoke Shell commands in Vanta" }).count()) === 0 && (await events(page)).some((e) => e[0] === "revoke" && e[1] === "ap1"));
for (const sec of ["Models", "Voice", "Appearance", "General"]) { await page.getByRole("button", { name: sec, exact: true }).click(); }
let tabs = 0; const seen = new Set();
for (let i = 0; i < 30; i++) { await page.keyboard.press("Tab"); const inside = await page.evaluate(() => !!document.activeElement?.closest(".vp-sheet")); if (!inside) break; seen.add(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 40))); tabs++; }
check("settings: Tab stays inside the dialog (focus trap)", tabs === 30, `left after ${tabs} tabs`);
await shot("settings-focus");
await page.keyboard.press("Escape");
check("settings: Escape closes", (await events(page)).at(-1)?.[0] === "settingsClose");

// ---- 12px floor + contrast across screens, both themes
const SCREENS = ["home", "schedules", "connections", "skills", "outputs", "workbench&tab=changes", "workbench&tab=files", "workbench&tab=browser", "workbench&tab=terminal", "workbench&tab=outputs", "palette", "settings"];
for (const theme of ["light", "dark"]) {
  for (const s of SCREENS) {
    await open(`screen=${s}&theme=${theme}`);
    const r = await page.evaluate(() => {
      const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (m) { const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [r / 255, g / 255, b / 255, a]; }
        const k = c.match(/color\(srgb ([^)]+)\)/); if (k) { const [r, g, b, a = 1] = k[1].split(/[ /]+/).map(Number); return [r, g, b, a]; } return null; };
      const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
      const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; } }
        return layers.reduceRight((acc, c) => over(c, acc), [1, 1, 1, 1]); };
      const small = [], low = [];
      for (const el of document.querySelectorAll(".vp *")) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own || el.closest("[data-owner]")) continue;
        const cs = getComputedStyle(el);
        if (parseFloat(cs.fontSize) < 12) small.push(el.textContent.trim().slice(0, 30) + " " + cs.fontSize);
        const bg = bgOf(el), fgRaw = parse(cs.color), fg = fgRaw && over(fgRaw, bg);
        if (fg) { const l1 = lum(fg), l2 = lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          if (ratio < 4.5 && cs.visibility !== "hidden") low.push(`${el.textContent.trim().slice(0, 24)} ${ratio.toFixed(2)}`); }
      }
      return { small, low };
    });
    check(`${theme} ${s}: no text under 12px`, r.small.length === 0, r.small.join(", "));
    check(`${theme} ${s}: all text >= 4.5:1`, r.low.length === 0, r.low.slice(0, 6).join(", "));
  }
}

// ---- Reduced motion
const rm = await browser.newContext({ viewport: { width: 1500, height: 740 }, reducedMotion: "reduce" });
const rp = await rm.newPage();
await rp.goto(`${base}/vanta-fixtures.html?screen=home`); await rp.waitForSelector("#frame");
const anim = await rp.evaluate(() => getComputedStyle(document.querySelector(".vp-spin")).animationName);
check("reduced motion: running spinner is static", anim === "none", anim);
await rp.goto(`${base}/vanta-fixtures.html?screen=home&state=loading`); await rp.waitForSelector("#frame");
const skel = await rp.evaluate(() => getComputedStyle(document.querySelector(".vp-skel")).animationName);
check("reduced motion: skeleton is static", skel === "none", skel);

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(outDir, "drive-results.json"), JSON.stringify(results, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
