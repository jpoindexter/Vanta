#!/usr/bin/env node
// Side-by-side proofs: the wireframe (left) and the built app (right) in each sampled state.
//
//   node tools/parity/proofs.mjs [--only w1440.chat-waiting] [--out docs/proofs/parity]
//
// The app side needs a fixtures build (npm run parity:build). Output is one JPEG per state.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { enterState } from "./runner.mjs";
import { openTarget, prepareMap } from "./targets.mjs";
import { DESKTOP_NEXT, PARITY_DOCS, WIREFRAME_HTML, parseArgs, rejectUnknown } from "./io.mjs";
import { SelectorMap, Spec, loadJson } from "./schemas.mjs";

const require = createRequire(import.meta.url);
const KNOWN = ["only", "out"];
const SETTLE_MS = 400;
const JPEG_QUALITY = 82;

async function shoot(target, map, stateId, state, file, locator) {
  const entered = await enterState({ target, map, state: { id: stateId, ...state }, options: { vars: {}, settleMs: SETTLE_MS } });
  if (!entered.ok) throw new Error(`${stateId}: ${entered.reason}`);
  const shot = { path: file, type: "jpeg", quality: JPEG_QUALITY };
  if (locator) await target.page.locator(locator).screenshot(shot);
  else await target.page.screenshot(shot);
}

async function compose(chromium, left, right, label, out) {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 2000, height: 600 } });
  const img = (f) => `<img src="${pathToFileURL(f).href}" style="display:block;width:100%;border:1px solid #ccc">`;
  const cell = (title, f) => `<figure style="margin:0;flex:1;min-width:0"><figcaption style="font:600 13px system-ui;padding:6px 0">${title}</figcaption>${img(f)}</figure>`;
  const html = out.replace(/\.jpg$/, ".html");
  fs.writeFileSync(html, `<body style="margin:0;padding:12px;background:#fff"><div style="font:600 15px system-ui;padding-bottom:6px">${label}</div><div style="display:flex;gap:16px;align-items:flex-start">${cell("Wireframe", left)}${cell("Built app", right)}</div></body>`);
  await page.goto(pathToFileURL(html).href, { waitUntil: "load" });
  await page.screenshot({ path: out, type: "jpeg", quality: JPEG_QUALITY, fullPage: true });
  await browser.close();
  fs.rmSync(html);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  rejectUnknown(args, KNOWN);
  const spec = loadJson(path.join(PARITY_DOCS, "wireframe-spec.json"), Spec);
  const wireMap = prepareMap(loadJson(path.join(PARITY_DOCS, "selector-map.json"), SelectorMap), spec.frameHeight);
  const appMap = prepareMap(loadJson(path.join(PARITY_DOCS, "app-selector-map.json"), SelectorMap), spec.frameHeight);
  const outDir = path.resolve(args.out ?? path.join(DESKTOP_NEXT, "docs", "proofs", "parity"));
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "parity-proof-"));
  const { chromium } = require("playwright-core");
  const wire = await openTarget({ kind: "file", url: WIREFRAME_HTML, map: wireMap, viewport: { width: wireMap.viewport.w, height: wireMap.viewport.h } });
  const app = await openTarget({ kind: "electron", desktopRoot: path.join(DESKTOP_NEXT, "apps", "desktop"), map: appMap, viewport: { width: 1440, height: spec.frameHeight } });
  try {
    for (const [id, state] of Object.entries(spec.states).filter(([id]) => !args.only || id.startsWith(args.only))) {
      const left = path.join(tmp, `${id}-wire.jpg`);
      const right = path.join(tmp, `${id}-app.jpg`);
      await shoot(wire, wireMap, id, state, left, "#frame");
      await shoot(app, appMap, id, state, right, null);
      await compose(chromium, left, right, id, path.join(outDir, `${id}.jpg`));
      console.log(`  ${id}`);
    }
  } finally {
    await wire.close();
    await app.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`proofs failed: ${err.message}`);
  process.exit(2);
});
