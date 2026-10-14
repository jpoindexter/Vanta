#!/usr/bin/env node
// Compare a running app against docs/parity/wireframe-spec.json.
//
//   node tools/parity/check-app.mjs --electron [--desktop-root <apps/desktop>]
//   node tools/parity/check-app.mjs --url http://localhost:5173
//   node tools/parity/check-app.mjs --file docs/wireframe/vanta-desktop-wireframe.html --map docs/parity/selector-map.json   (self-check)
//
// Exit 1 on any FAIL or UNMAPPED (UNMAPPED tolerated with --allow-unmapped).
import fs from "node:fs";
import path from "node:path";
import { globToRe } from "./compare.mjs";
import { copyRow } from "./copy-check.mjs";
import { measureAll, measureCopy } from "./probe.mjs";
import { enterState } from "./runner.mjs";
import { renderMarkdown, summarize } from "./report.mjs";
import { buildRows } from "./rows.mjs";
import { openTarget, prepareMap } from "./targets.mjs";
import { DESKTOP_NEXT, PARITY_DOCS, parseArgs, rejectUnknown, stringifyCompact, writeText } from "./io.mjs";
import { AllowedDeviations, CopyInventory, SelectorMap, Spec, loadJson } from "./schemas.mjs";

const KNOWN = ["map", "spec", "copy", "deviations", "out-dir", "name", "url", "file", "electron", "desktop-root", "only", "allow-unmapped", "settle", "quiet"];
const DEFAULT_SETTLE_MS = 250;

function specKeys(spec) {
  const keys = new Set();
  for (const st of Object.values(spec.states)) {
    for (const k of Object.keys(st.elements)) keys.add(k.replace(/\[\d+\]$/, "[]"));
    for (const k of [...st.absent, ...Object.keys(st.lists)]) keys.add(k);
  }
  return [...keys];
}

function openOptions(args, map) {
  if (args.electron) {
    const desktopRoot = path.resolve(args["desktop-root"] ?? path.join(DESKTOP_NEXT, "apps", "desktop"));
    return { kind: "electron", desktopRoot, label: `electron ${desktopRoot}` };
  }
  if (args.file) return { kind: "file", url: path.resolve(args.file), label: `file ${args.file}` };
  if (args.url) return { kind: "url", url: args.url, label: args.url };
  throw new Error("Pick a target: --electron, --url <url> or --file <html>.");
}

/** Wireframe strings declared absent from the app for this state. */
function declaredCopy(deviations, stateId) {
  return deviations.filter((d) => d.copy && (!d.states || d.states.some((g) => globToRe(g).test(stateId)))).flatMap((d) => d.copy);
}

async function checkState(env, specState, stateId) {
  const { target, appMap, spec, deviations, copyInv, settle } = env;
  const state = { id: stateId, ...specState };
  const entered = await enterState({ target, map: appMap, state, options: { vars: { url: env.url ?? "" }, settleMs: settle } });
  const keys = Object.keys(appMap.keys).filter((k) => appMap.keys[k] !== "UNMAPPED");
  const base = { stateId, specState, appMap, keyOptions: spec.keyOptions, deviations: env.devList };
  const allowGlyphs = deviations.some((d) => d.transform === "stripGlyphs" && d.props.includes("text"));
  if (!entered.ok) {
    return { rows: buildRows({ ...base, measured: null, blocked: entered.reason }), copy: copyRow({ stateId, expected: copyInv.states[stateId], appStrings: [], blocked: entered.reason, allowGlyphs, declared: declaredCopy(env.devList, stateId) }), blocked: entered.reason };
  }
  const measured = await measureAll(target.page, appMap, { keys, hoverOnlyKeys: new Set(spec.hoverOnlyKeys) });
  const appCopy = await measureCopy(target.page, appMap);
  const copy = copyRow({ stateId, expected: copyInv.states[stateId], appStrings: [...appCopy.rest, ...appCopy.hover], appPieces: appCopy.pieces, allowGlyphs, declared: declaredCopy(env.devList, stateId) });
  return { rows: buildRows({ ...base, measured, blocked: null }), copy, frame: measured.frame };
}

function frameNote(frame, specState) {
  if (!frame || (Math.round(frame.w) === specState.frame.w && Math.round(frame.h) === specState.frame.h)) return "";
  return `viewport is ${Math.round(frame.w)}x${Math.round(frame.h)}, spec frame is ${specState.frame.w}x${specState.frame.h}`;
}

export async function runCheck(args) {
  const spec = loadJson(path.resolve(args.spec ?? path.join(PARITY_DOCS, "wireframe-spec.json")), Spec);
  const copyInv = loadJson(path.resolve(args.copy ?? path.join(PARITY_DOCS, "copy-inventory.json")), CopyInventory);
  const devFile = loadJson(path.resolve(args.deviations ?? path.join(PARITY_DOCS, "allowed-deviations.json")), AllowedDeviations);
  const mapFile = path.resolve(args.map ?? path.join(PARITY_DOCS, "app-selector-map.json"));
  const appMap = prepareMap(loadJson(mapFile, SelectorMap), spec.frameHeight);
  const opened = openOptions(args, appMap);
  const vp = appMap.viewport.mode === "fixed" ? { width: appMap.viewport.w, height: appMap.viewport.h } : { width: 1440, height: spec.frameHeight };
  const target = await openTarget({ ...opened, map: appMap, viewport: vp });
  const env = { target, appMap, spec, deviations: devFile.deviations, devList: devFile.deviations, copyInv, settle: Number(args.settle ?? DEFAULT_SETTLE_MS), url: opened.url };
  const rows = [];
  const copyRows = [];
  const stateNotes = {};
  try {
    for (const [id, st] of Object.entries(spec.states).filter(([id]) => !args.only || id.startsWith(args.only))) {
      const r = await checkState(env, st, id);
      rows.push(...r.rows);
      copyRows.push(r.copy);
      stateNotes[id] = r.blocked ?? frameNote(r.frame, st);
      const bad = r.rows.filter((x) => x.status === "FAIL").length;
      if (!args.quiet) process.stdout.write(`  ${id}: ${r.rows.length} rows, ${bad} FAIL${r.blocked ? `, UNMAPPED (${r.blocked})` : ""}\n`);
    }
  } finally {
    await target.close();
  }
  return assemble({ spec, appMap, devFile, rows, copyRows, stateNotes, label: opened.label, mapFile });
}

/** True when a declared not-applicable deviation names this base key (any state). */
const declaresNa = (deviations, key) => deviations.some((d) => d.na && (d.keys ?? []).some((g) => globToRe(g).test(key)));

function assemble({ spec, appMap, devFile, rows, copyRows, stateNotes, label, mapFile }) {
  const mappedKeys = new Set(Object.keys(appMap.keys).filter((k) => appMap.keys[k] !== "UNMAPPED"));
  const keys = specKeys(spec);
  const naKeys = new Set(keys.filter((k) => !mappedKeys.has(k) && declaresNa(devFile.deviations, k)));
  const summary = summarize({ rows, copyRows, mappedKeys, naKeys, specKeys: keys });
  const stateIds = Object.keys(stateNotes);
  const driven = stateIds.filter((id) => !stateNotes[id].startsWith("no driver") && !stateNotes[id].startsWith("driver failed")).length;
  const bad = summary.rows.FAIL + summary.copy.states.FAIL;
  const unmapped = summary.rows.UNMAPPED + summary.copy.states.UNMAPPED;
  const warnings = [...mappedKeys].filter((k) => !keys.includes(k)).map((k) => `map key "${k}" is not a wireframe role key (typo?)`);
  const meta = { target: label, map: path.relative(DESKTOP_NEXT, mapFile), specSha: spec.source.sha256, specStates: Object.keys(spec.states).length, states: { driven, total: stateIds.length }, stateNotes, verdict: "", warnings };
  return { summary, rows, copyRows, meta, devFile, bad, unmapped };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), ["electron", "allow-unmapped", "quiet"]);
  rejectUnknown(args, KNOWN);
  const run = await runCheck(args);
  const failing = run.bad > 0 || (run.unmapped > 0 && !args["allow-unmapped"]);
  run.meta.verdict = failing ? "NOT AT PARITY" : "PARITY";
  const outDir = path.resolve(args["out-dir"] ?? PARITY_DOCS);
  const name = args.name ?? "report";
  const json = { version: 1, meta: run.meta, summary: run.summary, copy: run.copyRows, rows: run.rows };
  writeText(path.join(outDir, `${name}.json`), stringifyCompact(json, 3));
  writeText(path.join(outDir, `${name}.md`), renderMarkdown({ summary: run.summary, rows: run.rows, copyRows: run.copyRows, meta: run.meta, deviations: run.devFile.deviations }));
  const r = run.summary.rows;
  console.log(`rows ${r.total}: ${r.PASS} PASS, ${r.ALLOWED} ALLOWED, ${r.FAIL} FAIL, ${r.UNMAPPED} UNMAPPED | keys ${run.summary.keys.mapped}/${run.summary.keys.total} mapped | verdict ${run.meta.verdict}`);
  console.log(`wrote ${path.join(outDir, `${name}.md`)}`);
  process.exit(failing ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`check-app failed: ${err.message}`);
    process.exit(2);
  });
}
