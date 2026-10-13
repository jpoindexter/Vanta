// Runs the shared wireframe parity checker against the fixtures harness for the states and
// role keys Track W owns (workbench, Home, list pages, palette, settings sheet).
//   node tools/parity-pages-run.mjs [--url http://127.0.0.1:5291] [--spec docs/parity/wireframe-spec.json] [--copy docs/parity/copy-inventory.json] [--out docs/proofs/pages/parity-checker]
// The shared app-selector-map.json is used as is, except that facets owned by other tracks (chat,
// drawer, extra, theme) become no-ops so only this track's keys are judged.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { runCheck } from "./parity/check-app.mjs";
import { baseKey } from "./parity/locate.mjs";
import { DESKTOP_NEXT, PARITY_DOCS, parseArgs } from "./parity/io.mjs";

const args = parseArgs(process.argv.slice(2));
const base = args.url ?? "http://127.0.0.1:5291";
const specFile = path.resolve(args.spec ?? path.join(PARITY_DOCS, "wireframe-spec.json"));
const outDir = path.resolve(args.out ?? path.join(DESKTOP_NEXT, "docs/proofs/pages/parity-checker"));
const STATE_PREFIXES = ["w1440.view-", "w1440.wb-", "w1440.palette", "w1440.settings", "w1100.wb-changes", "w1100.view-home", "w1100.settings", "w800.wb-changes", "w800.view-home", "w800.settings", "w800.palette"];

async function ensureServer() {
  try { await fetch(base); return null; } catch { /* start one */ }
  const child = spawn("npx", ["vite", "--port", new URL(base).port, "--host", "127.0.0.1"], { cwd: path.join(DESKTOP_NEXT, "apps/desktop"), stdio: "ignore" });
  for (let i = 0; i < 60; i++) { try { await fetch(base); return child; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  throw new Error("fixtures dev server did not start");
}

const shared = JSON.parse(fs.readFileSync(path.join(PARITY_DOCS, "app-selector-map.json"), "utf8"));
const mapped = (k) => shared.keys[k] !== undefined && shared.keys[k] !== "UNMAPPED";
const myKeys = new Set(Object.keys(shared.keys).filter((k) => mapped(k) && /^(workbench|wbtab|page|listpage|list\.|home\.|palette\.|settings\.)/.test(k)).map(baseKey));
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "parity-pages-")), "map.json");
const drivers = { ...shared.drivers, base: [] };
for (const f of Object.keys(drivers)) if (/^(chat|drawer|extra|theme):/.test(f)) drivers[f] = [];
fs.writeFileSync(tmp, JSON.stringify({ ...shared, drivers }));

const server = await ensureServer();
const rows = [], copy = [];
try {
  for (const only of STATE_PREFIXES) {
    const run = await runCheck({ map: tmp, spec: specFile, copy: args.copy, url: base, only, quiet: true, settle: 400 });
    rows.push(...run.rows.filter((r) => myKeys.has(baseKey(r.key))));
    copy.push(...run.copyRows.filter((c) => c.state === only || c.state.startsWith(only)));
  }
} finally { if (server) server.kill(); }

const count = (rs) => rs.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
const byState = {};
for (const r of rows) (byState[r.state] ??= []).push(r);
fs.mkdirSync(outDir, { recursive: true });
const summary = { keys: myKeys.size, rows: rows.length, status: count(rows), copy: count(copy) };
const lines = [`# Pages parity (shared checker, fixtures harness)`, ``, `Spec: ${path.relative(DESKTOP_NEXT, specFile)}. Keys judged: ${myKeys.size}. Rows: ${rows.length} => ${JSON.stringify(summary.status)}.`, ``, `| State | PASS | FAIL | ALLOWED | UNMAPPED |`, `|---|---|---|---|---|`];
for (const [s, rs] of Object.entries(byState)) { const c = count(rs); lines.push(`| ${s} | ${c.PASS ?? 0} | ${c.FAIL ?? 0} | ${c.ALLOWED ?? 0} | ${c.UNMAPPED ?? 0} |`); }
lines.push(``, `## FAIL rows`, ``);
for (const r of rows.filter((x) => x.status === "FAIL")) lines.push(`- ${r.state} ${r.key}: ${(r.props ?? []).filter((p) => p.status === "FAIL").map((p) => `${p.prop} expected ${JSON.stringify(p.expected)} got ${JSON.stringify(p.actual)}`).join("; ") || r.reason || ""}`);
lines.push(``, `## UNMAPPED rows`, ``);
for (const r of rows.filter((x) => x.status === "UNMAPPED")) lines.push(`- ${r.state} ${r.key}: ${r.reason}`);
fs.writeFileSync(path.join(outDir, "report.md"), lines.join("\n") + "\n");
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ summary, rows, copy }, null, 1));
console.log(JSON.stringify(summary));
for (const [s, rs] of Object.entries(byState)) console.log(s, JSON.stringify(count(rs)));
