#!/usr/bin/env node
// Drive the approved wireframe through every state in states.mjs and write
// docs/parity/wireframe-spec.json + copy-inventory.json. Deterministic by design:
// timers are frozen, animations off, a fresh page load per state.
//
//   node tools/parity/extract-spec.mjs [--out-dir <dir>] [--only <state-id-prefix>]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { measureAll, measureCopy } from "./probe.mjs";
import { enterState } from "./runner.mjs";
import { FRAME_HEIGHT, STATES } from "./states.mjs";
import { isListKey } from "./locate.mjs";
import { openTarget, prepareMap } from "./targets.mjs";
import { DESKTOP_NEXT, PARITY_DOCS, WIREFRAME_HTML, parseArgs, rejectUnknown, stringifyCompact, writeText } from "./io.mjs";
import { SelectorMap, loadJson } from "./schemas.mjs";

const SETTLE_MS = 0;

function mappedKeys(map) {
  return Object.keys(map.keys).filter((k) => map.keys[k] !== "UNMAPPED");
}

function keyOptions(map) {
  const out = {};
  for (const [key, entry] of Object.entries(map.keys)) {
    if (entry === "UNMAPPED" || !(entry.hug || entry.flow || entry.tol)) continue;
    out[key] = { ...(entry.hug && { hug: true }), ...(entry.flow && { flow: true }), ...(entry.tol && { tol: entry.tol }) };
  }
  return out;
}

function buildState(state, measured) {
  const elements = {};
  const lists = {};
  const absent = [];
  for (const [key, items] of Object.entries(measured.found)) {
    if (isListKey(key)) {
      lists[key] = items.length;
      items.forEach((el, i) => (elements[key.replace("[]", `[${i}]`)] = el));
    } else if (items.length) elements[key] = items[0];
    else absent.push(key);
  }
  return { w: state.w, theme: state.theme, facets: state.facets, frame: { w: state.w, h: FRAME_HEIGHT }, absent, lists, elements };
}

async function extractState({ target, map, state, keys, hoverOnlyKeys }) {
  const entered = await enterState({ target, map, state, options: { vars: {}, settleMs: SETTLE_MS } });
  if (!entered.ok) throw new Error(`${state.id}: ${entered.reason}`);
  const measured = await measureAll(target.page, map, { keys, hoverOnlyKeys });
  if (Math.round(measured.frame.w) !== state.w) {
    throw new Error(`${state.id}: frame is ${measured.frame.w}px wide, expected ${state.w}. The wireframe layout changed or the viewport is too small.`);
  }
  const copy = await measureCopy(target.page, map);
  return { spec: buildState(state, measured), copy: { strings: copy.rest, hoverOnly: copy.hover } };
}

export async function extract({ mapFile, wireframe, only }) {
  const map = loadJson(mapFile, SelectorMap);
  const keys = mappedKeys(map);
  const hoverOnlyKeys = new Set(keys.filter((k) => map.keys[k].hoverOnly));
  const prepared = prepareMap(map, FRAME_HEIGHT);
  const target = await openTarget({ kind: "file", url: wireframe, map: prepared, viewport: { width: map.viewport.w ?? 1600, height: map.viewport.h ?? 1200 } });
  const states = {};
  const copyStates = {};
  try {
    for (const state of STATES.filter((s) => !only || s.id.startsWith(only))) {
      const full = { ...state, frame: { w: state.w, h: FRAME_HEIGHT } };
      const r = await extractState({ target, map: prepared, state: full, keys, hoverOnlyKeys });
      states[state.id] = r.spec;
      copyStates[state.id] = r.copy;
      process.stdout.write(`  ${state.id}: ${Object.keys(r.spec.elements).length} elements, ${r.copy.strings.length} strings\n`);
    }
  } finally {
    await target.close();
  }
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(wireframe)).digest("hex");
  const source = { file: path.relative(DESKTOP_NEXT, wireframe), sha256 };
  return {
    spec: { version: 1, source, frameHeight: FRAME_HEIGHT, hoverOnlyKeys: [...hoverOnlyKeys], keyOptions: keyOptions(map), states },
    copy: { version: 1, states: copyStates },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  rejectUnknown(args, ["out-dir", "only", "map", "wireframe"]);
  const outDir = path.resolve(args["out-dir"] ?? PARITY_DOCS);
  const mapFile = path.resolve(args.map ?? path.join(PARITY_DOCS, "selector-map.json"));
  const { spec, copy } = await extract({ mapFile, wireframe: path.resolve(args.wireframe ?? WIREFRAME_HTML), only: args.only });
  writeText(path.join(outDir, "wireframe-spec.json"), stringifyCompact(spec, 4));
  writeText(path.join(outDir, "copy-inventory.json"), stringifyCompact(copy, 3));
  console.log(`wrote ${path.join(outDir, "wireframe-spec.json")} and copy-inventory.json (${Object.keys(spec.states).length} states)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`extract-spec failed: ${err.message}`);
    process.exit(1);
  });
}
