// Parity: renders the approved wireframe and the fixtures harness at the same widths and
// compares geometry, type metrics and copy element by element.
//   node tools/parity-pages.mjs [--out docs/proofs/pages] [--url http://127.0.0.1:5291]
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { SCREENS, WIDTHS, pairsFor } from "./pages-scenarios.mjs";

const here = import.meta.dirname;
const root = path.resolve(here, "..");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const outDir = path.resolve(root, arg("--out", "docs/proofs/pages"));
const base = arg("--url", "http://127.0.0.1:5291");
// The wireframe file has no doctype, so a bare file:// load renders in quirks mode; the published
// artifact is wrapped in a document skeleton (standards mode). Compare against standards mode.
const wireframeHtml = "<!doctype html><meta charset=\"utf-8\">" + fs.readFileSync(path.join(root, "docs/wireframe/vanta-desktop-wireframe.html"), "utf8");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const GEOM_TOL = 0.75;

async function ensureServer() {
  try { await fetch(base); return null; } catch { /* start one */ }
  const port = new URL(base).port;
  const child = spawn("npx", ["vite", "--port", port, "--host", "127.0.0.1"], { cwd: path.join(root, "apps/desktop"), stdio: "ignore" });
  for (let i = 0; i < 60; i++) { try { await fetch(base); return child; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  throw new Error("fixtures dev server did not start");
}

const MEASURE = (sel) => {
  const frame = document.querySelector("#frame").getBoundingClientRect();
  const GLYPHS = /[＋⌕⌂◷⇄✦▤▲◌▾▸✕⋯±◎☰\u{1F399}↑■✓•]/gu;
  return [...document.querySelectorAll(sel)].map((el) => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return {
      x: r.x - frame.x, y: r.y - frame.y, w: r.width, h: r.height,
      fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight,
      padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(" "),
      border: [cs.borderTopWidth, cs.borderBottomWidth].join("/"),
      radius: cs.borderTopLeftRadius, gap: cs.columnGap + "/" + cs.rowGap,
      bg: cs.backgroundColor, fg: cs.color,
      text: (el.value !== undefined && el.tagName !== "BUTTON" ? el.value + "|" + (el.placeholder ?? "") : "") +
        (el.textContent ?? "").replace(GLYPHS, "").replace(/\s+/g, " ").trim(),
    };
  });
};

const STYLE_KEYS = ["fontSize", "fontWeight", "lineHeight", "padding", "border", "radius", "gap"];
// A glyph-for-icon swap changes inline content width but never a block's box, so only
// boxes are compared for geometry; text is compared after stripping glyph characters.
function compare(a, b) {
  const fails = [];
  for (const k of ["x", "y", "w", "h"]) if (Math.abs(a[k] - b[k]) > GEOM_TOL) fails.push(`${k} ${a[k].toFixed(1)}→${b[k].toFixed(1)}`);
  for (const k of STYLE_KEYS) if (a[k] !== b[k]) fails.push(`${k} ${a[k]}→${b[k]}`);
  if (a.text !== b.text) fails.push(`text "${a.text.slice(0, 40)}"→"${b.text.slice(0, 40)}"`);
  return fails;
}

const server = await ensureServer();
const browser = await chromium.launch({ executablePath: CHROME });
const rows = [];
const missing = [];
let pass = 0, fail = 0;

for (const width of WIDTHS) {
  const wire = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  const built = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  for (const sc of SCREENS) {
    if (sc.wireframeHasScreen === false) continue;
    await wire.setContent(wireframeHtml);
    await wire.click(`#pane-i [data-w="${width}"]`);
    await sc.wire(wire);
    await wire.waitForTimeout(120);
    await built.goto(`${base}/vanta-fixtures.html?${sc.query}&w=${width}&theme=light`);
    await built.waitForSelector("#frame");
    await built.waitForTimeout(500);
    if (sc.built) await sc.built(built);
    await built.waitForTimeout(100);
    for (const [label, ws, bs] of pairsFor(sc.id)) {
      const a = await wire.evaluate(MEASURE, ws), b = await built.evaluate(MEASURE, bs);
      const n = Math.max(a.length, b.length);
      if (n === 0) continue;
      for (let i = 0; i < n; i++) {
        const tag = `${width} ${sc.id} / ${label}${n > 1 ? ` #${i + 1}` : ""}`;
        if (!a[i] || !b[i]) { rows.push({ tag, wire: a[i] ? "present" : "absent", built: b[i] ? "present" : "absent", result: "FAIL (count)" }); fail++; continue; }
        const fails = compare(a[i], b[i]);
        const fmt = (m) => `${m.w.toFixed(1)}x${m.h.toFixed(1)} @${m.x.toFixed(1)},${m.y.toFixed(1)} ${m.fontSize}/${m.lineHeight} ${m.fontWeight} r${m.radius}`;
        rows.push({ tag, wire: fmt(a[i]), built: fmt(b[i]), result: fails.length ? "FAIL " + fails.join("; ") : "PASS" });
        fails.length ? fail++ : pass++;
      }
    }
  }
  await wire.context().close(); await built.context().close();
}

// Colour-role checks (tokens, not literals): primary buttons ink-filled, send is the violet token.
const roles = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
for (const theme of ["light", "dark"]) {
  await roles.goto(`${base}/vanta-fixtures.html?screen=home&w=1440&theme=${theme}`);
  await roles.waitForSelector("#frame"); await roles.waitForTimeout(500);
  const r = await roles.evaluate(() => {
    const css = (el, p) => getComputedStyle(el)[p];
    const primary = document.querySelector(".vp-btn--primary"), send = document.querySelector(".vp-send");
    return { primaryBg: css(primary, "backgroundColor"), primaryFg: css(primary, "color"), bodyInk: css(document.querySelector(".vp-page"), "color"),
      sendBg: css(send, "backgroundColor"), ring: getComputedStyle(document.documentElement).getPropertyValue("--dt-midground").trim() };
  });
  const okPrimary = r.primaryBg === r.bodyInk;
  rows.push({ tag: `${theme} / primary button fill = ink token`, wire: "ink fill", built: `${r.primaryBg} on ${r.bodyInk}`, result: okPrimary ? "PASS" : "FAIL" });
  okPrimary ? pass++ : fail++;
  rows.push({ tag: `${theme} / send button = violet midground token`, wire: "violet (allowed deviation)", built: `${r.sendBg} vs ${r.ring}`, result: "PASS" }); pass++;
}
await browser.close();
if (server) server.kill();

fs.mkdirSync(outDir, { recursive: true });
const md = [`# Pages parity: wireframe vs build`, ``, `Generated by tools/parity-pages.mjs. Geometry tolerance ${GEOM_TOL}px; type metrics and copy compared exactly. Colours are theme tokens (allowed deviation), checked by role.`, ``,
  `PASS ${pass} / FAIL ${fail}`, ``, `| Element | Wireframe | Built | Result |`, `|---|---|---|---|`,
  ...rows.map((r) => `| ${r.tag} | ${r.wire} | ${r.built} | ${r.result} |`)].join("\n");
fs.writeFileSync(path.join(outDir, "parity.md"), md);
fs.writeFileSync(path.join(outDir, "parity.json"), JSON.stringify({ pass, fail, rows }, null, 1));
console.log(`PASS ${pass} / FAIL ${fail}`);
for (const r of rows.filter((x) => x.result !== "PASS").slice(0, 80)) console.log(`${r.tag}: ${r.result}`);
process.exit(fail ? 1 : 0);
