// Summaries and the human-readable markdown for a parity run.

const STATUSES = ["PASS", "ALLOWED", "FAIL", "UNMAPPED"];
const blank = () => ({ PASS: 0, ALLOWED: 0, FAIL: 0, UNMAPPED: 0, total: 0 });

function bump(counts, status) {
  counts[status] += 1;
  counts.total += 1;
}

export const pct = (n, d) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);

/** Roll rows up by state and by base key. Key status: UNMAPPED > FAIL > PASS (ALLOWED counts as PASS). */
export function summarize({ rows, copyRows, mappedKeys, naKeys = new Set(), specKeys }) {
  const total = blank();
  const byState = {};
  const byKey = {};
  for (const r of rows) {
    bump(total, r.status);
    bump((byState[r.state] ??= blank()), r.status);
    const base = r.key.replace(/\[\d+\]$/, "[]");
    bump((byKey[base] ??= blank()), r.status);
  }
  const keyStatus = Object.fromEntries(
    Object.entries(byKey).map(([k, c]) => [k, !mappedKeys.has(k) ? (naKeys.has(k) ? "N/A" : "UNMAPPED") : c.FAIL ? "FAIL" : c.UNMAPPED ? "UNMAPPED" : "PASS"]),
  );
  const keys = { total: specKeys.length, mapped: specKeys.filter((k) => mappedKeys.has(k)).length, na: specKeys.filter((k) => !mappedKeys.has(k) && naKeys.has(k)).length, unmapped: 0, pass: 0, fail: 0 };
  for (const k of specKeys) {
    const s = keyStatus[k] ?? (mappedKeys.has(k) ? "PASS" : naKeys.has(k) ? "N/A" : "UNMAPPED");
    if (s === "N/A") continue;
    if (s === "UNMAPPED") keys.unmapped += 1;
    else if (s === "FAIL") keys.fail += 1;
    else keys.pass += 1;
  }
  const copy = blank();
  let strings = 0;
  let found = 0;
  let declared = 0;
  for (const c of copyRows) {
    bump(copy, c.status);
    strings += c.total;
    found += c.found;
    declared += c.declared ?? 0;
  }
  return { rows: total, keys, copy: { states: copy, strings, found, declared }, byState, byKey, keyStatus };
}

const table = (head, body) => [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)];
const cell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 90);

function failGroups(rows) {
  const groups = new Map();
  for (const r of rows.filter((x) => x.status === "FAIL")) {
    const base = r.key.replace(/\[\d+\]$/, "[]");
    for (const p of (r.props ?? []).filter((x) => x.status === "FAIL")) {
      const id = `${base} :: ${p.prop}`;
      const g = groups.get(id) ?? { key: base, prop: p.prop, n: 0, example: r, p };
      g.n += 1;
      groups.set(id, g);
    }
  }
  return [...groups.values()].sort((a, b) => b.n - a.n);
}

function allowedGroups(rows) {
  const g = new Map();
  for (const r of rows) for (const p of r.props ?? []) if (p.status === "ALLOWED") g.set(p.deviation, (g.get(p.deviation) ?? 0) + 1);
  return g;
}

function headline(s, meta) {
  const r = s.rows;
  const parity = pct(r.PASS + r.ALLOWED, r.total);
  return [
    `# Wireframe parity report`,
    "",
    `Target: ${meta.target}. Wireframe sha256 ${meta.specSha.slice(0, 12)}, ${meta.specStates} states. Verdict: **${meta.verdict}**.`,
    "",
    ...table(["Measure", "Value"], [
      ["Rows (element x state)", `${r.total}: ${r.PASS} PASS, ${r.ALLOWED} ALLOWED, ${r.FAIL} FAIL, ${r.UNMAPPED} UNMAPPED`],
      ["Parity (PASS + ALLOWED) / all rows", parity],
      ["Role keys", `${s.keys.total}: ${s.keys.mapped} mapped, ${s.keys.na ?? 0} declared N/A, ${s.keys.unmapped} unmapped; of mapped, ${s.keys.pass} pass, ${s.keys.fail} fail`],
      ["States", `${meta.states.driven} of ${meta.states.total} drivable in the app`],
      ["Copy", `${s.copy.found} of ${s.copy.strings} wireframe strings found (${pct(s.copy.found, s.copy.strings)}), ${s.copy.declared ?? 0} declared absent (${pct(s.copy.found + (s.copy.declared ?? 0), s.copy.strings)} found or declared); state rows: ${s.copy.states.PASS} PASS, ${s.copy.states.ALLOWED} ALLOWED, ${s.copy.states.FAIL} FAIL, ${s.copy.states.UNMAPPED} UNMAPPED`],
    ]),
    "",
  ];
}

export function renderMarkdown({ summary, rows, copyRows, meta, deviations }) {
  const out = headline(summary, meta);
  out.push("## By state", "", ...table(["State", "PASS", "ALLOWED", "FAIL", "UNMAPPED", "Note"], Object.entries(summary.byState).map(([id, c]) => [id, c.PASS, c.ALLOWED, c.FAIL, c.UNMAPPED, cell(meta.stateNotes[id] ?? "")])), "");
  const fails = failGroups(rows);
  out.push(`## FAIL (${fails.length} key/property groups)`, "");
  if (fails.length) out.push(...table(["Key", "Property", "Rows", "First example (state: expected -> actual)"], fails.slice(0, 120).map((g) => [g.key, g.prop, g.n, cell(`${g.example.state}: ${g.p.expected} -> ${g.p.actual}`)])));
  const unmapped = Object.entries(summary.keyStatus).filter(([, s]) => s === "UNMAPPED").map(([k]) => k);
  out.push("", `## UNMAPPED keys (${unmapped.length})`, "", unmapped.length ? unmapped.map((k) => `\`${k}\``).join(", ") : "none", "");
  const reasons = new Map();
  for (const r of rows.filter((x) => x.status === "UNMAPPED" && x.reason !== "key not mapped for the app")) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
  if (reasons.size) out.push("### States the app could not be driven into", "", ...table(["Reason", "Rows"], [...reasons].map(([k, n]) => [cell(k), n])), "");
  const allowed = allowedGroups(rows);
  out.push("## ALLOWED deviations", "", ...table(["Deviation", "Rows", "Reason"], [...allowed].map(([id, n]) => [id, n, cell(deviations.find((d) => d.id === id)?.reason)])), "");
  out.push("## Copy by state", "", ...table(["State", "Status", "Found", "Missing (first 3)"], copyRows.map((c) => [c.state, c.status, `${c.found}/${c.total}`, cell((c.missing ?? [c.reason ?? ""]).slice(0, 3).join("; "))])), "");
  return `${out.join("\n")}\n`;
}

export { STATUSES };
