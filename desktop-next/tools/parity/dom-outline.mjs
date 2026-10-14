#!/usr/bin/env node
// Print a condensed DOM outline of the built app in one state, to find locators for the selector map.
//
//   node tools/parity/dom-outline.mjs --state w1440.chat-waiting --root "[data-vanta-titlebar];aside" [--depth 6] [--box]
//   --root takes several selectors separated by ;
import path from "node:path";
import { enterState } from "./runner.mjs";
import { openTarget, prepareMap } from "./targets.mjs";
import { DESKTOP_NEXT, PARITY_DOCS, parseArgs, rejectUnknown } from "./io.mjs";
import { SelectorMap, Spec, loadJson } from "./schemas.mjs";

const KNOWN = ["state", "root", "depth", "box"];

/** Serialised into the page: no imports, no closures. */
function outline({ rootSel, depth, box }) {
  const all = [];
  for (const sel of rootSel.split(";").map((x) => x.trim()).filter(Boolean)) {
    all.push(`## ${sel}`);
    const root = document.querySelector(sel);
    all.push(root ? run(root) : "no match");
  }
  return all.join("\n");

  function run(root) {
  const lines = [];
  const walk = (el, level) => {
    if (level > depth) return;
    const cs = getComputedStyle(el);
    if (cs.display === "none") return;
    const attrs = ["data-testid", "data-slot", "role", "aria-label", "aria-current", "data-status"].filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a)}`);
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean).slice(0, 4).join(".") : "";
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean).join(" ").slice(0, 40);
    const r = el.getBoundingClientRect();
    const b = box ? ` @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` : "";
    lines.push(`${"  ".repeat(level)}${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${attrs.length ? ` [${attrs.join(" ")}]` : ""}${own ? ` "${own}"` : ""}${b}`);
    for (const child of el.children) walk(child, level + 1);
  };
  walk(root, 0);
  return lines.join("\n");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2), ["box"]);
  rejectUnknown(args, KNOWN);
  const spec = loadJson(path.join(PARITY_DOCS, "wireframe-spec.json"), Spec);
  const state = spec.states[args.state];
  if (!state) throw new Error(`Unknown state "${args.state}".`);
  const appMap = prepareMap(loadJson(path.join(PARITY_DOCS, "app-selector-map.json"), SelectorMap), spec.frameHeight);
  const target = await openTarget({ kind: "electron", desktopRoot: path.join(DESKTOP_NEXT, "apps", "desktop"), map: appMap, viewport: { width: state.w, height: state.frame.h } });
  try {
    const entered = await enterState({ target, map: appMap, state: { id: args.state, ...state }, options: { vars: {}, settleMs: 400 } });
    if (!entered.ok) throw new Error(entered.reason);
    console.log(await target.page.evaluate(outline, { rootSel: args.root ?? "body", depth: Number(args.depth ?? 6), box: Boolean(args.box) }));
  } finally {
    await target.close();
  }
}

main().catch((err) => {
  console.error(`dom-outline failed: ${err.message}`);
  process.exit(2);
});
