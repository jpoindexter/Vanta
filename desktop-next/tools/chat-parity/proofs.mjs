// node tools/chat-parity/proofs.mjs [--out docs/proofs/chat] [--only shots|measure|parity] [--widths 1440,1100,800]
// Needs the fixtures harness served (cd apps/desktop && npx vite --port 5199) and Google Chrome.
// Writes: screenshots (built, wireframe, side by side), measurements.json, parity.json and parity.md.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium, openBuilt, openWireframe, measureAll } from "./measure.mjs";
import { compareQueue, compareState } from "./compare.mjs";
import { KNOWN_DEVIATIONS } from "./deviations.mjs";

const here = import.meta.dirname;
const require = createRequire(path.join(here, "..", "..", "package.json"));
const { PNG } = require("pngjs");

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const out = path.resolve(opt("--out", path.join(here, "..", "..", "docs", "proofs", "chat")));
const only = opt("--only", "all");
const WIDTHS = opt("--widths", "1440,1100,800").split(",").map(Number);
const THEMES = ["light", "dark"];
const STATES = ["empty", "running", "waiting", "blocked", "done", "failed", "offline"];
const base = process.env.CHAT_BASE ?? "http://127.0.0.1:5199";
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });

async function clipOf(page, sel) {
  return page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, sel);
}

function sideBySide(leftPath, rightPath, outPath) {
  const a = PNG.sync.read(fs.readFileSync(leftPath));
  const b = PNG.sync.read(fs.readFileSync(rightPath));
  const gap = 24;
  const height = Math.max(a.height, b.height);
  const img = new PNG({ width: a.width + gap + b.width, height });
  img.data.fill(128);
  PNG.bitblt(a, img, 0, 0, a.width, a.height, 0, 0);
  PNG.bitblt(b, img, 0, 0, b.width, b.height, a.width + gap, 0);
  fs.writeFileSync(outPath, PNG.sync.write(img));
}

async function shots() {
  for (const w of WIDTHS) for (const theme of THEMES) for (const state of STATES) {
    const stem = `${state}-${theme}-${w}`;
    const built = await openBuilt(browser, { w, theme, state, base });
    await built.page.screenshot({ path: path.join(out, `built-${stem}.png`), clip: await clipOf(built.page, "[data-fixture-main]") });
    await built.ctx.close();
    const wf = await openWireframe(browser, { w, theme, state });
    await wf.page.screenshot({ path: path.join(out, `wireframe-${stem}.png`), clip: await clipOf(wf.page, "#app .main") });
    await wf.ctx.close();
    sideBySide(path.join(out, `wireframe-${stem}.png`), path.join(out, `built-${stem}.png`), path.join(out, `sbs-${stem}.png`));
  }
}

const SCENARIOS = [
  { name: "long-answer-code", state: "done", flags: "long" },
  { name: "queued-messages", state: "running", flags: "queue" },
  { name: "composer-attachments", state: "done", flags: "attachments" },
  { name: "composer-10-line-draft", state: "done", flags: "draft10" },
  { name: "composer-attachments-and-draft", state: "waiting", flags: "attachments,draft10,queue" },
  { name: "stop-state", state: "running", flags: "" },
  { name: "jump-to-latest", state: "done", flags: "many", scrollTop: true },
  { name: "offline-composer", state: "offline", flags: "netdown" },
];

async function scenarios() {
  for (const theme of THEMES) {
    for (const sc of SCENARIOS) {
      const built = await openBuilt(browser, { w: 1440, theme, state: sc.state, flags: sc.flags, base });
      if (sc.scrollTop) {
        await built.page.evaluate(() => { document.querySelector('[data-slot="aui_thread-viewport"]').scrollTop = 0; });
        await built.page.waitForTimeout(600);
      }
      await built.page.screenshot({ path: path.join(out, `scenario-${sc.name}-${theme}-1440.png`), clip: await clipOf(built.page, "[data-fixture-main]") });
      await built.ctx.close();
    }
    // Steps expanded, and the step the person opened.
    const open = await openBuilt(browser, { w: 1440, theme, state: "waiting", base });
    await open.page.click('[data-vp="step"][aria-expanded="false"]');
    await open.page.waitForTimeout(500);
    await open.page.screenshot({ path: path.join(out, `scenario-steps-expanded-${theme}-1440.png`), clip: await clipOf(open.page, "[data-fixture-main]") });
    await open.ctx.close();
    // Card gallery: the cards the thread cannot easily reach.
    const g = await openBuilt(browser, { w: 1440, theme, state: "waiting", flags: "gallery", base });
    await g.page.locator('[data-vp="approval-actions"]').nth(4).getByRole("button", { name: "Allow once" }).click();
    await g.page.locator('[data-vp="approval-actions"]').nth(5).getByRole("button", { name: "Allow once" }).click();
    await g.page.waitForTimeout(500);
    await g.page.screenshot({ path: path.join(out, `scenario-cards-${theme}-1440.png`), fullPage: false, clip: await clipOf(g.page, "[data-fixture-main]") });
    await g.ctx.close();
  }
}

async function measure() {
  const results = [];
  for (const theme of THEMES) for (const w of WIDTHS) for (const state of STATES) {
    const b = await openBuilt(browser, { w, theme, state, base });
    const m = await b.page.evaluate(() => {
      const px = (v) => parseFloat(v);
      const texts = [];
      const walker = document.createTreeWalker(document.querySelector("[data-fixture-main]"), NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n.textContent.trim();
        const el = n.parentElement;
        if (!t || !el) continue;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none" || el.closest(".sr-only")) continue;
        texts.push({ t: t.slice(0, 40), size: px(cs.fontSize) });
      }
      const col = document.querySelector('[data-vp="column"]');
      const bubble = document.querySelector('[data-vp="user-bubble"]');
      const composer = document.querySelector('[data-vp="composer"]');
      const input = document.querySelector('[data-vp="composer-input"]');
      return {
        minFontPx: texts.length ? Math.min(...texts.map((x) => x.size)) : null,
        smallest: texts.filter((x) => x.size < 12).slice(0, 5),
        columnWidth: col ? col.getBoundingClientRect().width : null,
        bubbleRadius: bubble ? px(getComputedStyle(bubble).borderTopLeftRadius) : null,
        bubbleBorder: bubble ? px(getComputedStyle(bubble).borderTopWidth) : null,
        composerRadius: composer ? px(getComputedStyle(composer).borderTopLeftRadius) : null,
        composerWidth: composer ? composer.getBoundingClientRect().width : null,
        inputMinHeight: input ? px(getComputedStyle(input).minHeight) : null,
        inputHeight: input ? input.getBoundingClientRect().height : null,
      };
    });
    results.push({ theme, w, state, ...m });
    await b.ctx.close();
  }
  // Hover-only actions, focus ring, reduced motion.
  const extras = {};
  const h = await openBuilt(browser, { w: 1440, theme: "light", state: "done", base });
  const opacity = async (sel) => h.page.evaluate((s) => { let o = 1; for (let n = document.querySelector(s); n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; }, sel);
  extras.hoverActions = { userAtRest: await opacity('[data-vp="user-actions"]'), assistantAtRest: await opacity('[data-vp="assistant-actions"]') };
  await h.page.hover('[data-vp="user-bubble"]'); await h.page.waitForTimeout(250);
  extras.hoverActions.userOnHover = await opacity('[data-vp="user-actions"]');
  await h.page.mouse.move(2, 2);
  await h.page.focus('[data-vp="assistant-actions"] button'); await h.page.waitForTimeout(250);
  extras.hoverActions.assistantOnFocus = await opacity('[data-vp="assistant-actions"]');
  await h.ctx.close();
  const f = await openBuilt(browser, { w: 1440, theme: "light", state: "waiting", base });
  await f.page.keyboard.press("Tab");
  for (let i = 0; i < 40; i += 1) {
    const hit = await f.page.evaluate(() => { const a = document.activeElement; if (!a || !a.closest('[data-vp="approval-actions"]')) return null; const cs = getComputedStyle(a); return { text: a.textContent, outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor }; });
    if (hit) { extras.focusRing = hit; break; }
    await f.page.keyboard.press("Tab");
  }
  await f.ctx.close();
  const rm = await browser.newContext({ viewport: { width: 1700, height: 760 }, reducedMotion: "reduce", locale: "en-GB", timezoneId: "UTC" });
  const rp = await rm.newPage();
  await rp.goto(`${base}/chat-fixtures.html?state=running&theme=light&w=1440`);
  await rp.waitForSelector("[data-fixture-main]"); await rp.waitForTimeout(1500);
  extras.reducedMotion = await rp.evaluate(() => ({ runningAnimations: document.getAnimations().filter((a) => a.playState === "running").length, liveRegion: !!document.querySelector('[aria-live="polite"]') }));
  await rm.close();
  fs.writeFileSync(path.join(out, "measurements.json"), JSON.stringify({ results, extras }, null, 1));
  return { results, extras };
}

async function parity() {
  const rows = [];
  for (const theme of THEMES) for (const w of WIDTHS) {
    for (const state of STATES) rows.push(...(await compareState(browser, { state, w, theme, base })));
    rows.push(...(await compareQueue(browser, { w, theme, base })));
  }
  for (const r of rows) {
    const key = `${r.id}.${r.prop}`;
    r.status = r.pass ? "PASS" : KNOWN_DEVIATIONS[key] ? "DEVIATION" : "FAIL";
    r.reason = r.pass ? "" : KNOWN_DEVIATIONS[key] ?? "";
  }
  fs.writeFileSync(path.join(out, "parity.json"), JSON.stringify(rows, null, 1));
  const count = (s) => rows.filter((r) => r.status === s).length;
  const lines = [`# Chat parity against the wireframe`, ``, `Rows: ${rows.length}. PASS ${count("PASS")}, DEVIATION ${count("DEVIATION")}, FAIL ${count("FAIL")}.`, ``,
    `DEVIATION rows differ on purpose and carry the reason. Everything else that differs is a FAIL.`, ``, `| state | w | theme | element | prop | wireframe | built | status | reason |`, `|---|---|---|---|---|---|---|---|---|`];
  const cell = (v) => String(v).replace(/\|/g, "\\|").slice(0, 120);
  for (const r of rows) lines.push(`| ${r.state} | ${r.w} | ${r.theme} | ${r.id} | ${r.prop} | ${cell(r.wireframe)} | ${cell(r.built)} | ${r.status} | ${cell(r.reason)} |`);
  fs.writeFileSync(path.join(out, "parity.md"), lines.join("\n") + "\n");
  return rows;
}

if (only === "all" || only === "shots") await shots();
if (only === "all" || only === "shots") await scenarios();
if (only === "all" || only === "measure") await measure();
if (only === "all" || only === "parity") {
  const rows = await parity();
  const c = (s) => rows.filter((r) => r.status === s).length;
  console.log(`parity rows ${rows.length}: PASS ${c("PASS")} DEVIATION ${c("DEVIATION")} FAIL ${c("FAIL")}`);
}
await browser.close();
