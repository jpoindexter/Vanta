#!/usr/bin/env node
// Agent-ready report generator: audit.json (structured source) → audit.html
// (interactive human view). Mirrors the roadmap.json → roadmap.html pattern.
// No deps — plain Node, run: node argo-ts/scripts/build-audit.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const chip = (t, cls = "") => `<span class="chip ${cls}">${esc(t)}</span>`;
const fchips = (codes, filters) =>
  (codes || [])
    .map((c) => {
      const f = (filters || []).find((x) => x.code === c);
      return `<span class="chip f" title="${esc(f ? f.name + " — " + f.desc : c)}">${esc(c)}</span>`;
    })
    .join("");

const verdictClass = (v) => {
  const s = String(v).toUpperCase();
  if (s.includes("PULL") || s.includes("WORTH") || s.includes("LEAD")) return "ok";
  if (s.includes("DROP") || s.includes("NOT")) return "bad";
  if (s.includes("DEFER") || s.includes("PARITY") || s.includes("PARTIAL")) return "warn";
  return "";
};

function render(d) {
  const F = d.vision?.filters || [];

  const agentCards = (d.agents || [])
    .map(
      (a) => `<div class="card agent" data-id="${esc(a.id)}">
      <div class="row1"><b>${esc(a.name)}</b><span class="lic">${esc(a.license)}</span></div>
      <div class="muted lineage">${esc(a.lineage)} · ${esc(a.lang)}</div>
      <p class="tag">${esc(a.tagline)}</p>
      <div class="vsa"><span class="k">vs Vanta:</span> ${esc(a.vsVanta)}</div>
    </div>`,
    )
    .join("");

  const filterDefs = F.map(
    (f) => `<div class="fdef"><b>${esc(f.code)}</b> ${esc(f.name)} — <span class="muted">${esc(f.desc)}</span></div>`,
  ).join("");

  const thesisList = (d.vision?.thesis || []).map((t) => `<li>${esc(t)}</li>`).join("");

  const patRows = (d.operatorPatterns?.items || [])
    .map(
      (p) => `<tr><td class="cap">${esc(p.pattern)} ${fchips(p.filters, F)}</td><td class="muted">${esc(
        p.evidence,
      )}</td><td>${esc(p.feature)}</td></tr>`,
    )
    .join("");

  const invCats = (d.vantaInventory?.categories || [])
    .map(
      (c) => `<div class="card span4 inv"><h3>${esc(c.name)}</h3><ul>${c.items
        .map((i) => `<li>${esc(i)}</li>`)
        .join("")}</ul></div>`,
    )
    .join("");

  const ndStrong = (d.ndVisionAlignment?.strong || [])
    .map(
      (x) => `<div class="line ok"><b>${esc(x.feature)}</b> ${fchips(x.filters, F)}<div class="muted">${esc(
        x.why,
      )}</div></div>`,
    )
    .join("");
  const ndGaps = (d.ndVisionAlignment?.gaps || [])
    .map(
      (x) => `<div class="line warn"><b>${esc(x.gap)}</b> ${fchips(x.filters, F)}<div class="muted">${esc(
        x.note,
      )}</div></div>`,
    )
    .join("");

  const cmpRows = (d.comparison?.rows || [])
    .map(
      (r) => `<tr data-verdict="${esc(verdictClass(r.verdict))}">
      <td class="cap">${esc(r.capability)} ${fchips(r.ndFit, F)}</td>
      <td>${esc(r.vanta)}</td><td>${esc(r.hermes)}</td><td>${esc(r.goose)}</td><td>${esc(r.claudeCode)}</td>
      <td class="${verdictClass(r.verdict)}">${esc(r.verdict)}</td>
      <td class="muted">${esc(r.note)}</td></tr>`,
    )
    .join("");

  const pullCards = (d.pulls?.items || [])
    .map(
      (p) => `<div class="card span6 pull">
      <div class="row1"><b>${esc(p.feature)}</b>${chip(p.value, "ok")}</div>
      <div class="meta">src: ${esc(p.source)} · effort ${esc(p.effort)} · risk ${esc(p.risk)} ${fchips(
        p.filters,
        F,
      )}</div>
      <p class="muted">${esc(p.why)}</p></div>`,
    )
    .join("");

  const dropCards = (d.drops?.items || [])
    .map(
      (p) => `<div class="card span6 drop">
      <div class="row1"><b>${esc(p.feature)}</b>${chip("DROP", "bad")}</div>
      <div class="meta">src: ${esc(p.source)}</div>
      <p class="muted">${esc(p.why)}</p></div>`,
    )
    .join("");

  const issueTable = (arr) =>
    !arr || !arr.length
      ? `<p class="muted">Pending deep-dive enrichment.</p>`
      : `<table class="t"><thead><tr><th>#</th><th>Title</th><th>Verdict</th><th>Note</th></tr></thead><tbody>${arr
          .map(
            (i) =>
              `<tr><td>${esc(i.num)}</td><td>${esc(i.title)}</td><td class="${verdictClass(
                i.verdict,
              )}">${esc(i.verdict)}</td><td class="muted">${esc(i.note)}</td></tr>`,
          )
          .join("")}</tbody></table>`;

  const deltaRows = (d.localHermesDelta?.items || [])
    .map(
      (x) => `<tr><td class="cap">${esc(x.file)}</td><td>${esc(x.what)}</td><td class="${verdictClass(
        x.verdict,
      )}">${esc(x.verdict)}</td><td class="muted">${esc(x.why)}</td></tr>`,
    )
    .join("");

  const ccRows = (d.claudeCode?.items || [])
    .map(
      (x) => `<tr><td class="cap">${esc(x.finding)} ${fchips(x.filters, F)}</td><td>${esc(
        x.repo,
      )}</td><td>${esc(x.value)}</td><td>${esc(x.risk)}</td><td class="muted">${esc(x.note)}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(d.title)}</title>
<style>
:root{--bg:#070807;--panel:#0d1110;--panel2:#111817;--line:#26302d;--text:#e8eee9;--muted:#8a9992;--green:#64f4a1;--amber:#ffd166;--red:#ff6b6b;--blue:#7aa7ff;--violet:#c99cff}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0%,#14211b 0,#070807 34%,#050605 100%);color:var(--text);font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
header{padding:38px 44px 26px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,rgba(100,244,161,.08),transparent)}
h1{margin:0 0 8px;font-size:26px;letter-spacing:-.04em}h2{margin:0 0 12px;font-size:16px;color:#fff;letter-spacing:-.02em}
h3{margin:14px 0 8px;font-size:12px;color:var(--green);text-transform:uppercase;letter-spacing:.08em}
.sub{color:var(--muted);max-width:1000px}.stamp{margin-top:14px;color:#5f7068;font-size:12px}
.wrap{padding:24px 44px 80px;max-width:1500px;margin:auto}
.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px;margin:14px 0}
.card{background:linear-gradient(180deg,var(--panel),#0a0d0c);border:1px solid var(--line);border-radius:14px;padding:16px;box-shadow:0 14px 40px rgba(0,0,0,.28)}
.span4{grid-column:span 4}.span6{grid-column:span 6}.span12{grid-column:span 12}
p{margin:0 0 8px;color:#cad4cf}.muted{color:var(--muted)}
.chip{display:inline-flex;gap:5px;align-items:center;border:1px solid var(--line);background:#0a0f0e;border-radius:999px;padding:2px 8px;margin:2px;color:#cfd8d3;font-size:11px}
.chip.f{border-color:#2c4a3c;color:var(--green)}.chip.ok{border-color:#2c4a3c;color:var(--green)}.chip.bad{border-color:#4a2c2c;color:var(--red)}
.ok{color:var(--green)}.warn{color:var(--amber)}.bad{color:var(--red)}
section{margin:30px 0;scroll-margin-top:14px}
nav{position:sticky;top:0;z-index:5;background:rgba(7,8,7,.92);backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:10px 44px;display:flex;gap:8px;flex-wrap:wrap}
nav a{color:var(--muted);text-decoration:none;font-size:12px;padding:4px 9px;border:1px solid transparent;border-radius:8px}
nav a:hover{color:var(--green);border-color:var(--line)}
.agent .row1{display:flex;justify-content:space-between;align-items:baseline}.agent .lic{font-size:11px;color:var(--violet)}
.agent .lineage{font-size:11px;margin:2px 0 6px}.agent .tag{font-size:12px;min-height:34px}.agent .vsa{font-size:12px;color:#bcc8c2;border-top:1px solid var(--line);padding-top:8px}.agent .k{color:var(--blue)}
.fdef{font-size:12px;margin:3px 0}.fdef b{color:var(--green)}
ul.thesis{margin:6px 0 4px;padding-left:18px}ul.thesis li{font-size:13px;color:#d2dcd6;margin:6px 0}
.inv ul{margin:0;padding-left:16px}.inv li{font-size:12px;color:#bcc8c2;margin:2px 0}
.line{border-left:2px solid var(--line);padding:4px 0 4px 10px;margin:6px 0}.line.ok{border-color:var(--green)}.line.warn{border-color:var(--amber)}
table.t{width:100%;border-collapse:collapse;font-size:12px}table.t th,table.t td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
table.t th{color:var(--muted);font-weight:600;position:sticky;top:44px;background:#0b0f0e}
.cap{color:#fff}
.controls{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px}
.btn{cursor:pointer;border:1px solid var(--line);background:#0a0f0e;color:#cfd8d3;border-radius:8px;padding:5px 11px;font:inherit;font-size:12px}
.btn.active{border-color:var(--green);color:var(--green)}
.pull .row1,.drop .row1{display:flex;justify-content:space-between;align-items:baseline}.pull{border-color:#2c4a3c}.drop{border-color:#3a2c2c}
.meta{font-size:11px;color:var(--muted);margin:4px 0}
.note{font-size:12px;color:var(--muted);margin:0 0 10px}
.statusbar{display:inline-block;border:1px solid var(--amber);color:var(--amber);border-radius:8px;padding:3px 9px;font-size:11px;margin-top:10px}
input.search{background:#0a0f0e;border:1px solid var(--line);color:var(--text);border-radius:8px;padding:5px 10px;font:inherit;font-size:12px;min-width:220px}
</style></head><body>
<header>
<h1>${esc(d.title)}</h1>
<div class="sub">${esc(d.vision?.statement || "")}</div>
<div class="statusbar">${esc(d.status)}</div>
<div class="stamp">generated ${esc(d.generated)} · source: audit.json (agent-ready) · regenerate: node argo-ts/scripts/build-audit.mjs</div>
</header>
<nav>
<a href="#agents">Agents</a><a href="#vision">Vision</a><a href="#patterns">Patterns→Features</a><a href="#inventory">Vanta Inventory</a>
<a href="#nd">ND Alignment</a><a href="#matrix">Matrix</a><a href="#pulls">Pulls</a><a href="#drops">Drops</a>
<a href="#issues">Issues</a><a href="#local">Local Hermes</a><a href="#cc">Claude Code</a><a href="#docs">Docs</a>
</nav>
<div class="wrap">

<section id="agents"><h2>The agents</h2><div class="grid">${agentCards
    .replace(/class="card agent"/g, 'class="card span4 agent"')}</div></section>

<section id="vision"><h2>Vision — full-capability, executive-function-first</h2>
<div class="card span12"><p>${esc(d.vision?.statement || "")}</p>
${thesisList ? `<h3>The thesis</h3><ul class="thesis">${thesisList}</ul>` : ""}
<h3>Fit filters (the design lens)</h3>${filterDefs}
<h3>Curation bias</h3><p class="muted">${esc(d.vision?.curationBias || "")}</p></div></section>

<section id="patterns"><h2>Operator patterns → the feature that supplies the missing executive function</h2>
<p class="note">${esc(d.operatorPatterns?.note || "")}</p>
<div class="card span12"><table class="t"><thead><tr><th>Pattern (real, documented)</th><th>Evidence</th><th>Vanta feature that supplies the EF</th></tr></thead><tbody>${patRows}</tbody></table></div></section>

<section id="inventory"><h2>Vanta — current surface (dedupe baseline)</h2>
<p class="note">${esc(d.vantaInventory?.note || "")}</p><div class="grid">${invCats}</div></section>

<section id="nd"><h2>ND alignment — what Vanta already does · where the gaps are</h2>
<div class="grid"><div class="card span6"><h3>Already strong</h3>${ndStrong}</div>
<div class="card span6"><h3>Gaps (pull candidates)</h3>${ndGaps}</div></div></section>

<section id="matrix"><h2>Capability matrix</h2>
<p class="note">${esc(d.comparison?.note || "")}</p>
<div class="controls">
<button class="btn active" data-filt="all">All</button>
<button class="btn" data-filt="ok">Leads / Pull</button>
<button class="btn" data-filt="warn">Parity / Defer</button>
<button class="btn" data-filt="bad">Drop</button>
<input class="search" id="msearch" placeholder="filter capabilities…"/>
</div>
<div class="card span12"><table class="t" id="matrix-t"><thead><tr><th>Capability</th><th>Vanta</th><th>Hermes</th><th>Goose</th><th>Claude Code</th><th>Verdict</th><th>Note</th></tr></thead><tbody>${cmpRows}</tbody></table></div></section>

<section id="pulls"><h2 class="ok">Pull — worth adding (curated)</h2>
<p class="note">${esc(d.pulls?.note || "")} ${esc(d.pulls?.pendingFrom || "")}</p><div class="grid">${pullCards}</div></section>

<section id="drops"><h2 class="bad">Drop — lose totally / do not build</h2>
<p class="note">${esc(d.drops?.note || "")} ${esc(d.drops?.pendingFrom || "")}</p><div class="grid">${dropCards}</div></section>

<section id="issues"><h2>GitHub issue triage</h2>
<p class="note">${esc(d.issues?.note || "")}</p>
<div class="grid"><div class="card span6"><h3>Hermes issues</h3>${issueTable(d.issues?.hermes)}</div>
<div class="card span6"><h3>Goose issues</h3>${issueTable(d.issues?.goose)}</div></div></section>

<section id="local"><h2>Local Hermes — customization delta</h2>
<p class="note">${esc(d.localHermesDelta?.note || "")}</p>
<div class="card span12"><table class="t"><thead><tr><th>File / area</th><th>What it does</th><th>Verdict</th><th>Why</th></tr></thead><tbody>${deltaRows}</tbody></table></div></section>

<section id="cc"><h2>Claude Code — reference findings</h2>
<p class="note">${esc(d.claudeCode?.note || "")}</p>
<div class="card span12"><table class="t"><thead><tr><th>Finding</th><th>Repo</th><th>Value</th><th>Risk</th><th>Note</th></tr></thead><tbody>${ccRows}</tbody></table></div></section>

<section id="docs"><h2>Docs takeaways</h2><div class="grid">
<div class="card span6"><h3>Hermes user-stories</h3><p class="muted">${esc(d.docsTakeaways?.hermes || "")}</p></div>
<div class="card span6"><h3>Goose guides</h3><p class="muted">${esc(d.docsTakeaways?.goose || "")}</p></div></div></section>

</div>
<script>
const rows=[...document.querySelectorAll('#matrix-t tbody tr')];
const apply=()=>{const f=document.querySelector('.btn.active').dataset.filt;const q=(document.getElementById('msearch').value||'').toLowerCase();
rows.forEach(r=>{const okF=f==='all'||r.dataset.verdict===f;const okQ=!q||r.textContent.toLowerCase().includes(q);r.style.display=(okF&&okQ)?'':'none';});};
document.querySelectorAll('.btn').forEach(b=>b.onclick=()=>{document.querySelectorAll('.btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');apply();});
document.getElementById('msearch').oninput=apply;
</script></body></html>`;
}

const data = JSON.parse(await readFile(join(repoRoot, "audit.json"), "utf8"));
const out = join(repoRoot, "audit.html");
await writeFile(out, render(data), "utf8");
console.log("wrote " + out);
