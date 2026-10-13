#!/usr/bin/env node
// Prove the harness before trusting it. Writes evidence to docs/parity/evidence/.
//   1. determinism: extract-spec twice -> byte-identical, and equal to the committed spec
//   2. self-check: the wireframe checked against itself -> 100% PASS
//   3. negative tests: mutate the wireframe, the checker must FAIL exactly the mutated rows
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { extract } from "./extract-spec.mjs";
import { runCheck } from "./check-app.mjs";
import { renderMarkdown } from "./report.mjs";
import { MUTATIONS } from "./mutations.mjs";
import { PARITY_DOCS, WIREFRAME_HTML, stringifyCompact, writeText } from "./io.mjs";

const EVIDENCE = path.join(PARITY_DOCS, "evidence");
const MAP = path.join(PARITY_DOCS, "selector-map.json");
const MAX_PRINTED = 10;
const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");
const log = [];
const say = (line) => {
  log.push(line);
  console.log(line);
};

async function determinism() {
  const a = await extract({ mapFile: MAP, wireframe: WIREFRAME_HTML });
  const b = await extract({ mapFile: MAP, wireframe: WIREFRAME_HTML });
  const text = (r) => [stringifyCompact(r.spec, 4), stringifyCompact(r.copy, 3)];
  const [specA, copyA] = text(a);
  const [specB, copyB] = text(b);
  const committed = (f) => fs.existsSync(path.join(PARITY_DOCS, f)) ? fs.readFileSync(path.join(PARITY_DOCS, f), "utf8") : "";
  const lines = [
    `run1 wireframe-spec.json   sha256 ${sha(specA)}`,
    `run2 wireframe-spec.json   sha256 ${sha(specB)}`,
    `run1 copy-inventory.json   sha256 ${sha(copyA)}`,
    `run2 copy-inventory.json   sha256 ${sha(copyB)}`,
    `committed wireframe-spec.json sha256 ${sha(committed("wireframe-spec.json"))}`,
    `committed copy-inventory.json sha256 ${sha(committed("copy-inventory.json"))}`,
  ];
  const ok = specA === specB && copyA === copyB && specA === committed("wireframe-spec.json") && copyA === committed("copy-inventory.json");
  lines.forEach(say);
  say(`DETERMINISM: ${ok ? "PASS byte-identical (two fresh runs and the committed files)" : "FAIL outputs differ"}`);
  return ok;
}

async function selfCheck() {
  const run = await runCheck({ file: WIREFRAME_HTML, map: MAP, settle: "0", quiet: true });
  const r = run.summary.rows;
  const ok = r.PASS === r.total && run.summary.copy.states.PASS === run.copyRows.length;
  run.meta.verdict = ok ? "PARITY" : "NOT AT PARITY";
  writeText(path.join(EVIDENCE, "selfcheck-report.md"), renderMarkdown({ summary: run.summary, rows: run.rows, copyRows: run.copyRows, meta: run.meta, deviations: run.devFile.deviations }));
  say(`SELF-CHECK (wireframe vs itself): ${r.total} rows, ${r.PASS} PASS, ${r.ALLOWED} ALLOWED, ${r.FAIL} FAIL, ${r.UNMAPPED} UNMAPPED; keys ${run.summary.keys.mapped}/${run.summary.keys.total} mapped; copy ${run.summary.copy.found}/${run.summary.copy.strings} strings`);
  say(`SELF-CHECK: ${ok ? "PASS 100%" : "FAIL not 100%"}`);
  return ok;
}

function failedPairs(run) {
  const pairs = new Map();
  for (const row of run.rows.filter((x) => x.status === "FAIL")) {
    for (const p of row.props ?? []) {
      const id = `${row.key.replace(/\[\d+\]$/, "[]")}:${p.prop}`;
      pairs.set(id, [...(pairs.get(id) ?? []), row.state]);
    }
  }
  return pairs;
}

async function negative(m) {
  const html = fs.readFileSync(WIREFRAME_HTML, "utf8");
  if (html.split(m.find).length !== 2) throw new Error(`mutation "${m.id}": the find string must occur exactly once in the wireframe.`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "parity-mut-"));
  const file = path.join(dir, "mutated.html");
  fs.writeFileSync(file, html.replace(m.find, m.replace));
  const run = await runCheck({ file, map: MAP, settle: "0", quiet: true });
  fs.rmSync(dir, { recursive: true, force: true });
  const pairs = failedPairs(run);
  const verdict = m.assert(pairs, run);
  const copyFails = run.copyRows.filter((c) => c.status === "FAIL").map((c) => c.state);
  say(`NEGATIVE ${m.id}: ${m.description}`);
  const detail = [...pairs].map(([id, states]) => `FAIL ${id} in ${states.length} state(s)${states.length < 4 ? ` (${states.join(", ")})` : ""}`);
  writeText(path.join(EVIDENCE, `negative-${m.id}.txt`), `${m.description}\n${detail.join("\n")}\n`);
  detail.slice(0, MAX_PRINTED).forEach((d) => say(`  ${d}`));
  if (detail.length > MAX_PRINTED) say(`  ... ${detail.length - MAX_PRINTED} more key:prop pairs (full list in evidence/negative-${m.id}.txt)`);
  say(`  copy rows FAIL: ${copyFails.length}`);
  say(`  other rows still PASS: ${run.summary.rows.PASS} of ${run.summary.rows.total}`);
  say(`NEGATIVE ${m.id}: ${verdict.ok ? "PASS" : "FAIL"} - ${verdict.why}`);
  return verdict.ok;
}

async function main() {
  const results = [await determinism(), await selfCheck()];
  for (const m of MUTATIONS) results.push(await negative(m));
  const ok = results.every(Boolean);
  say(`SELFTEST: ${ok ? "ALL PASS" : "FAILED"}`);
  writeText(path.join(EVIDENCE, "selftest-output.txt"), `${log.join("\n")}\n`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`selftest failed: ${err.message}`);
  process.exit(2);
});
